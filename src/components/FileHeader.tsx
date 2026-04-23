import './FileHeader.css';

interface FileHeaderProps {
  fileName: string;
  isPrivate: boolean;
  onTogglePrivate: (next: boolean) => void;
}

/**
 * 右上のファイル名表示 + ホバーで出る属性メニュー。
 *
 * - プライベート時は鍵アイコンを常時表示する（状態が一目で分かるように）
 * - ホバー時に属性トグルが下にふわっと出てくる
 */
export default function FileHeader({ fileName, isPrivate, onTogglePrivate }: FileHeaderProps) {
  return (
    <div className={`file-header${isPrivate ? ' file-header--private' : ''}`}>
      <div className="file-header-label">
        {isPrivate && <span className="file-header-lock" aria-label="プライベート">🔒</span>}
        <span className="file-header-name">{fileName.replace(/\.md$/, '')}</span>
      </div>
      <div className="file-header-menu" role="menu">
        <label className="file-header-menu-row">
          <span className="file-header-menu-label">プライベート</span>
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
