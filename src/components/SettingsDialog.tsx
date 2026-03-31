import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (visible) {
      setBaseDir(settings.baseDir);
    }
  }, [visible, settings.baseDir]);

  if (!visible) return null;

  const handleSave = () => {
    const trimmed = baseDir.trim();
    if (!trimmed) return;
    onSave({ ...settings, baseDir: trimmed });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-title">環境設定</div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="settings-basedir">
            保存先ディレクトリ
          </label>
          <input
            id="settings-basedir"
            className="settings-input"
            type="text"
            value={baseDir}
            onChange={(e) => setBaseDir(e.target.value)}
            autoFocus
            spellCheck={false}
          />
          <div className="settings-hint">
            ファイルの保存・読み込みのベースディレクトリ
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
