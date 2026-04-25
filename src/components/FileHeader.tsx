import { Lock } from 'lucide-react';
import './FileHeader.css';

interface FileHeaderProps {
  fileName: string;
  isPrivate: boolean;
  onTogglePrivate: (next: boolean) => void;
}

/**
 * 右上のファイル名表示 + ホバーで出る属性メニュー。
 *
 * - 通常時はファイル名だけ表示（プライベート時は鍵アイコン付き）
 * - ホバー時はファイル名を含む同じカード内に属性トグルが下に展開する。
 *   ファイル名とメニューを別要素にすると隙間でホバーが切れるので、
 *   ひとつのカードを膨らませる構造にしている。
 */
export default function FileHeader({ fileName, isPrivate, onTogglePrivate }: FileHeaderProps) {
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
      </div>
    </div>
  );
}
