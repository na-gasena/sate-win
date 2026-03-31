import './ShortcutHelp.css';

const sections = [
  {
    title: 'App',
    items: [
      { keys: ['Cmd', '/'], description: 'ショートカット一覧' },
      { keys: ['Cmd', 'O'], description: 'ファイルを開く' },
      { keys: ['Cmd', 'N'], description: '新規ファイル' },
    ],
  },
  {
    title: 'Editor',
    items: [
      { keys: ['Cmd', 'B'], description: '太字' },
      { keys: ['Cmd', 'I'], description: '斜体' },
      { keys: ['Cmd', 'Shift', 'X'], description: '打ち消し線' },
      { keys: ['Cmd', 'Z'], description: '元に戻す' },
      { keys: ['Cmd', 'Shift', 'Z'], description: 'やり直す' },
      { keys: ['Enter'], description: '段落を分割' },
      { keys: ['Shift', 'Enter'], description: '改行' },
      { keys: ['Tab'], description: 'リストのインデント' },
      { keys: ['Shift', 'Tab'], description: 'リストのインデント解除' },
    ],
  },
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
        {sections.map((section, si) => (
          <div className="shortcut-section" key={si}>
            <div className="shortcut-title">{section.title}</div>
            <div className="shortcut-list">
              {section.items.map((s, i) => (
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
        ))}
      </div>
    </div>
  );
}
