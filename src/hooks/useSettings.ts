import { useState, useEffect, useCallback } from 'react';
import {
  writeTextFile,
  readTextFile,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

// Settings are stored in ~/Library/Application Support/com.sate.app/ (macOS)
// Tauri's AppConfig BaseDirectory maps to the OS-standard config location.
const CONFIG_FILE = 'settings.json';

export interface Settings {
  baseDir: string;
}

const DEFAULT_SETTINGS: Settings = {
  baseDir: '~/Documents/Sate',
};

function resolveHome(path: string): string {
  // Remove trailing slash
  return path.replace(/\/+$/, '');
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

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
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
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

  // Resolve the baseDir to get the actual path components for Tauri fs
  // "~/Documents/Sate" -> baseDir: Home, subPath: "Documents/Sate"
  const resolvedPath = useCallback((): { baseDir: BaseDirectory; subPath: string } => {
    const dir = resolveHome(settings.baseDir);
    if (dir.startsWith('~/') || dir === '~') {
      const sub = dir === '~' ? '' : dir.slice(2);
      return { baseDir: BaseDirectory.Home, subPath: sub };
    }
    // For absolute paths, we still use Home as base and store the full path
    // This is a simplification; for now we support ~/... paths
    return { baseDir: BaseDirectory.Home, subPath: dir.replace(/^\//, '') };
  }, [settings.baseDir]);

  return {
    settings,
    loaded,
    updateSettings,
    resolvedPath,
  };
}
