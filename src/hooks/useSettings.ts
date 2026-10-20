import { useState, useEffect, useCallback } from 'react';
import {
  writeTextFile,
  readTextFile,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { getIdentifier } from '@tauri-apps/api/app';

// Settings are stored in ~/Library/Application Support/club.image.sate/ (macOS)
// Tauri's AppConfig BaseDirectory maps to the OS-standard config location.
const CONFIG_FILE = 'settings.json';

export interface Settings {
  baseDir: string; // Absolute path, e.g. "/Users/foo/Documents/Sate"
  publishCommand?: string; // 公開時に実行するシェルコマンド。未設定なら公開機能は無効。
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings from file on mount
  useEffect(() => {
    (async () => {
      try {
        const fileExists = await exists(CONFIG_FILE, {
          baseDir: BaseDirectory.AppConfig,
        });
        if (fileExists) {
          const text = await readTextFile(CONFIG_FILE, {
            baseDir: BaseDirectory.AppConfig,
          });
          const parsed = JSON.parse(text) as Partial<Settings>;
          if (parsed.baseDir) {
            setSettings({ baseDir: parsed.baseDir, publishCommand: parsed.publishCommand });
            return;
          }
        }

        const vaultName = (await getIdentifier()).endsWith('.dev') ? 'Sate Dev' : 'Sate';
        const defaultDir = await join(await documentDir(), vaultName);
        setSettings({ baseDir: defaultDir });
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError(`設定または保存先を読み込めませんでした: ${String(err)}`);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const updateSettings = useCallback(async (newSettings: Settings) => {
    setSettings(newSettings);
    try {
      // Ensure the AppConfig directory exists
      const dirExists = await exists('', {
        baseDir: BaseDirectory.AppConfig,
      });
      if (!dirExists) {
        await mkdir('', {
          baseDir: BaseDirectory.AppConfig,
          recursive: true,
        });
      }
      await writeTextFile(CONFIG_FILE, JSON.stringify(newSettings, null, 2), {
        baseDir: BaseDirectory.AppConfig,
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, []);

  return {
    settings,
    loaded,
    error,
    updateSettings,
  };
}
