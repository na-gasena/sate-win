import './ShortcutHelp.css';
import { shortcutKeyLabel } from '../lib/platform';

const sections = [
  {
    title: 'App',
    items: [
      { keys: ['Cmd', 'S'], description: '保存' },
      { keys: ['Cmd', '/'], description: 'ショートカット一覧' },
      { keys: ['Cmd', ','], description: '環境設定' },
      { keys: ['Cmd', 'O'], description: 'ファイルを開く' },
      { keys: ['Cmd', 'N'], description: '新規ファイル' },
    ],
  },
  {
    title: 'Find',
    items: [
      { keys: ['Cmd', 'F'], description: '文書内を検索' },
      { keys: ['Enter'], description: '次のヒットへ' },
      { keys: ['Shift', 'Enter'], description: '前のヒットへ' },
      { keys: ['Cmd', 'G'], description: '次のヒットへ（エディタから）' },
      { keys: ['Shift', 'Cmd', 'G'], description: '前のヒットへ（エディタから）' },
      { keys: ['Esc'], description: '閉じてヒット箇所を選択' },
    ],
  },
  {
    title: 'Rewind',
    items: [
      { keys: ['Shift', 'Cmd', 'Scroll'], description: 'スナップショットを遡る/進む' },
      { keys: ['←', '→'], description: '一つ戻る/進む' },
      { keys: ['Enter'], description: 'その時点に復元' },
      { keys: ['Esc'], description: '現在に戻る' },
    ],
  },
  {
    title: 'Text',
    items: [
      { keys: ['Cmd', 'B'], description: '太字' },
      { keys: ['Cmd', 'I'], description: '斜体' },
      { keys: ['Cmd', 'E'], description: 'インラインコード' },
      { keys: ['Cmd', 'Z'], description: '元に戻す' },
      { keys: ['Cmd', 'Shift', 'Z'], description: 'やり直す' },
      { keys: ['Enter'], description: '段落を分割' },
      { keys: ['Shift', 'Enter'], description: '改行' },
    ],
  },
  {
    title: 'Block',
    items: [
      { keys: ['Cmd', 'Opt', '0'], description: '本文に変換' },
      { keys: ['Cmd', 'Opt', '1'], description: '見出し 1' },
      { keys: ['Cmd', 'Opt', '2'], description: '見出し 2' },
      { keys: ['Cmd', 'Opt', '3'], description: '見出し 3' },
      { keys: ['Cmd', 'Shift', 'B'], description: '引用' },
      { keys: ['Cmd', 'Opt', '7'], description: '番号付きリスト' },
      { keys: ['Cmd', 'Opt', '8'], description: '箇条書き' },
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
                      <kbd key={j}>{shortcutKeyLabel(k)}</kbd>
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
