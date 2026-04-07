import { useCallback, useRef, useEffect } from 'react';
import type { Memo } from '../lib/frontmatter';
import './SideMemoLayer.css';

interface SideMemoLayerProps {
  memos: Memo[];
  onChange: (memos: Memo[]) => void;
  /** editor-container の ref。スクロール位置の基準に使う */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function SideMemoLayer({ memos, onChange, containerRef }: SideMemoLayerProps) {
  // --- ダブルクリックでメモ作成 ---
  const handleGutterDoubleClick = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      // クリック位置をコンテナ内の Y 座標に変換
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top + container.scrollTop;

      const newMemo: Memo = {
        id: crypto.randomUUID().slice(0, 8),
        side,
        y,
        content: '',
      };
      onChange([...memos, newMemo]);
    },
    [memos, onChange, containerRef]
  );

  // --- メモ内容の編集 ---
  const handleMemoChange = useCallback(
    (id: string, content: string) => {
      onChange(memos.map((m) => (m.id === id ? { ...m, content } : m)));
    },
    [memos, onChange]
  );

  // --- メモ削除（空メモで Backspace / ×ボタン） ---
  const handleDelete = useCallback(
    (id: string) => {
      onChange(memos.filter((m) => m.id !== id));
    },
    [memos, onChange]
  );

  // --- ドラッグで Y 位置変更 ---
  const handleDragStart = useCallback(
    (id: string, startClientY: number) => {
      const memo = memos.find((m) => m.id === id);
      if (!memo) return;
      const startY = memo.y;

      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startClientY;
        onChange(memos.map((m) => (m.id === id ? { ...m, y: Math.max(0, startY + dy) } : m)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [memos, onChange]
  );

  return (
    <div className="side-memo-layer">
      {/* 左余白 */}
      <div
        className="side-memo-gutter side-memo-gutter-left"
        onDoubleClick={(e) => handleGutterDoubleClick('left', e)}
      >
        {memos
          .filter((m) => m.side === 'left')
          .map((m) => (
            <MemoItem
              key={m.id}
              memo={m}
              onChange={handleMemoChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
            />
          ))}
      </div>
      {/* 右余白 */}
      <div
        className="side-memo-gutter side-memo-gutter-right"
        onDoubleClick={(e) => handleGutterDoubleClick('right', e)}
      >
        {memos
          .filter((m) => m.side === 'right')
          .map((m) => (
            <MemoItem
              key={m.id}
              memo={m}
              onChange={handleMemoChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
            />
          ))}
      </div>
    </div>
  );
}

// --- 個々のメモ ---
interface MemoItemProps {
  memo: Memo;
  onChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, startClientY: number) => void;
}

function MemoItem({ memo, onChange, onDelete, onDragStart }: MemoItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自動高さ調整
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [memo.content, autoResize]);

  // 新規作成時にフォーカス
  useEffect(() => {
    if (memo.content === '') {
      textareaRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 空メモでBackspace → 削除
      if (e.key === 'Backspace' && memo.content === '') {
        e.preventDefault();
        onDelete(memo.id);
      }
      // Escape → エディタにフォーカスを戻す
      if (e.key === 'Escape') {
        e.preventDefault();
        const el = document.querySelector('.ProseMirror') as HTMLElement | null;
        el?.focus();
      }
      // メモ内のキーイベントが親に伝搬しないようにする
      e.stopPropagation();
    },
    [memo.content, memo.id, onDelete]
  );

  return (
    <div
      className={`side-memo side-memo--${memo.side}`}
      style={{ top: memo.y }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        className="side-memo-drag"
        onMouseDown={(e) => {
          e.preventDefault();
          onDragStart(memo.id, e.clientY);
        }}
      />
      <button className="side-memo-delete" onClick={() => onDelete(memo.id)}>×</button>
      <textarea
        ref={textareaRef}
        className="side-memo-textarea"
        value={memo.content}
        placeholder="memo"
        rows={1}
        onChange={(e) => {
          onChange(memo.id, e.target.value);
          autoResize();
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
