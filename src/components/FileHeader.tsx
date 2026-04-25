import { Lock } from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import './FileHeader.css';

interface FileHeaderProps {
  fileName: string;
  isPrivate: boolean;
  onTogglePrivate: (next: boolean) => void;
  onDelete: () => void;
}

/**
 * 右上のファイル名表示 + ホバーで出る属性メニュー。
 *
 * - 通常時はファイル名だけ表示（プライベート時は鍵アイコン付き）
 * - ホバー時はファイル名を含む同じカード内に属性トグルが下に展開する。
 *   ファイル名とメニューを別要素にすると隙間でホバーが切れるので、
 *   ひとつのカードを膨らませる構造にしている。
 */
export default function FileHeader({ fileName, isPrivate, onTogglePrivate, onDelete }: FileHeaderProps) {
  const handleDelete = async () => {
    const ok = await confirm(`${fileName.replace(/\.md$/, '')} を削除しますか？`, {
      title: 'ファイルを削除',
      kind: 'warning',
      okLabel: '削除',
      cancelLabel: 'キャンセル',
    });
    if (ok) onDelete();
  };

  return (
    <div className="file-header">
      <div className="file-header-card">
        <div className="file-header-card-name">
          {isPrivate && <Lock className="file-header-lock" size={11} strokeWidth={1.75} aria-label="プライベート" />}
          <span className="file-header-name">{fileName.replace(/\.md$/, '')}</span>
        </div>
        <label className="file-header-card-row">
          <span className="file-header-menu-label">Private</span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => onTogglePrivate(e.target.checked)}
          />
        </label>
        <button
          type="button"
          className="file-header-card-row file-header-delete"
          onClick={handleDelete}
        >
          <span className="file-header-menu-label">Delete</span>
        </button>
      </div>
    </div>
  );
}
