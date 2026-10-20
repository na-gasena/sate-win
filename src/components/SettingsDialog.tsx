import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { Settings } from '../hooks/useSettings';
import './SettingsDialog.css';
import { desktopPlatform } from '../lib/platform';

interface SettingsDialogProps {
  visible: boolean;
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsDialog({
  visible,
  settings,
  onSave,
  onClose,
}: SettingsDialogProps) {
  const [baseDir, setBaseDir] = useState(settings.baseDir);
  const [publishCommand, setPublishCommand] = useState(settings.publishCommand ?? '');

  useEffect(() => {
    if (visible) {
      setBaseDir(settings.baseDir);
      setPublishCommand(settings.publishCommand ?? '');
    }
  }, [visible, settings.baseDir, settings.publishCommand]);

  const handleBrowse = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '保存先フォルダを選択',
    });
    if (selected) {
      setBaseDir(selected);
    }
  }, []);

  if (!visible) return null;

  const handleSave = () => {
    const trimmed = baseDir.trim();
    if (!trimmed) return;
    const trimmedPublish = publishCommand.trim();
    onSave({ ...settings, baseDir: trimmed, publishCommand: trimmedPublish || undefined });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="settings-overlay">
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-title">環境設定</div>

        <div className="settings-field">
          <label className="settings-label">保存先ディレクトリ</label>
          <div className="settings-dir-row">
            <div className="settings-dir-display">{baseDir}</div>
            <button
              className="settings-btn settings-btn-browse"
              onClick={handleBrowse}
            >
              変更…
            </button>
          </div>
          <div className="settings-hint">
            ファイルの保存・読み込みのベースディレクトリ
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">公開コマンド</label>
          <input
            type="text"
            className="settings-input"
            value={publishCommand}
            onChange={(e) => setPublishCommand(e.target.value)}
            placeholder={desktopPlatform === 'windows' ? '例: & "$HOME/text-site/publish.ps1"' : '例: ~/text-site/publish.sh'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="settings-hint">
            「公開」で実行する{desktopPlatform === 'windows' ? 'PowerShell' : 'シェル'}コマンド。
            公開用 md のパスを {desktopPlatform === 'windows' ? '$env:SATE_FILE' : '$SATE_FILE'}、
            ファイル名を {desktopPlatform === 'windows' ? '$env:SATE_SLUG' : '$SATE_SLUG'}、
            タイトルを {desktopPlatform === 'windows' ? '$env:SATE_TITLE' : '$SATE_TITLE'} で受け取る。空欄なら公開機能は無効。
          </div>
        </div>

        <div className="settings-actions">
          <button className="settings-btn settings-btn-cancel" onClick={onClose}>
            キャンセル
          </button>
          <button className="settings-btn settings-btn-save" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
