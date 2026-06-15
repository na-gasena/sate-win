import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { Settings } from '../hooks/useSettings';
import './SettingsDialog.css';

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
  const [publishDir, setPublishDir] = useState(settings.publishDir ?? '');

  useEffect(() => {
    if (visible) {
      setBaseDir(settings.baseDir);
      setPublishDir(settings.publishDir ?? '');
    }
  }, [visible, settings.baseDir, settings.publishDir]);

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

  const handleBrowsePublish = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '公開先（text-site リポジトリ）を選択',
    });
    if (selected) {
      setPublishDir(selected);
    }
  }, []);

  if (!visible) return null;

  const handleSave = () => {
    const trimmed = baseDir.trim();
    if (!trimmed) return;
    const trimmedPublish = publishDir.trim();
    onSave({ ...settings, baseDir: trimmed, publishDir: trimmedPublish || undefined });
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
          <label className="settings-label">公開先（text-site リポジトリ）</label>
          <div className="settings-dir-row">
            <div className="settings-dir-display">{publishDir || '（未設定）'}</div>
            <button
              className="settings-btn settings-btn-browse"
              onClick={handleBrowsePublish}
            >
              変更…
            </button>
            {publishDir && (
              <button
                className="settings-btn settings-btn-browse"
                onClick={() => setPublishDir('')}
              >
                クリア
              </button>
            )}
          </div>
          <div className="settings-hint">
            「公開」で md を書き出して git push するリポジトリ。未設定なら公開機能は無効。
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
