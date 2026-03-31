import './ShortcutHelp.css';

const shortcuts = [
  { keys: ['Cmd', '/'], description: 'ショートカット一覧' },
  { keys: ['Cmd', 'O'], description: 'ファイルを開く' },
  { keys: ['Cmd', 'N'], description: '新規ファイル' },
];

interface ShortcutHelpProps {
  visible: boolean;
  onClose: () => void;
}

export default function ShortcutHelp({ visible, onClose }: ShortcutHelpProps) {
  if (!visible) return null;

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div className="shortcut-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-title">Keyboard Shortcuts</div>
        <div className="shortcut-list">
          {shortcuts.map((s, i) => (
            <div className="shortcut-row" key={i}>
              <span className="shortcut-desc">{s.description}</span>
              <span className="shortcut-keys">
                {s.keys.map((k, j) => (
                  <kbd key={j}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
