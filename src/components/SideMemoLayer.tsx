import { useCallback, useRef, useEffect, useState } from 'react';
import type { Memo } from '../lib/frontmatter';
import type { EditorView } from '@milkdown/prose/view';
import { memoPluginKey } from './memoDecorationPlugin';
import './SideMemoLayer.css';

interface SideMemoLayerProps {
  memos: Memo[];
  onChange: (memos: Memo[]) => void;
  editorViewRef: React.RefObject<EditorView | null>;
}

export default function SideMemoLayer({ memos, onChange, editorViewRef }: SideMemoLayerProps) {
  // ── ガターダブルクリックでメモ作成 ──
  const handleGutterDoubleClick = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      const view = editorViewRef.current;
      if (!view) return;
      const editorRect = view.dom.getBoundingClientRect();
      const x = editorRect.left + editorRect.width / 2;
      const coords = view.posAtCoords({ left: x, top: e.clientY });
      if (!coords) return;
      const size = view.state.doc.content.size;
      const relativePos = size > 0 ? Math.max(0, Math.min(1, coords.pos / size)) : 0;
      onChange([...memos, { id: crypto.randomUUID().slice(0, 8), side, relativePos, content: '' }]);
    },
    [memos, onChange, editorViewRef],
  );

  return (
    <div className="side-memo-layer">
      <div className="side-memo-gutter side-memo-gutter-left" onDoubleClick={(e) => handleGutterDoubleClick('left', e)} />
      <div className="side-memo-gutter side-memo-gutter-right" onDoubleClick={(e) => handleGutterDoubleClick('right', e)} />
      {memos.map((m) => (
        <MemoCard
          key={m.id}
          memo={m}
          onChange={(id, content) => onChange(memos.map((x) => (x.id === id ? { ...x, content } : x)))}
          onDelete={(id) => onChange(memos.filter((x) => x.id !== id))}
          editorViewRef={editorViewRef}
        />
      ))}
    </div>
  );
}

// ── 個別メモカード ──

interface MemoCardProps {
  memo: Memo;
  onChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  editorViewRef: React.RefObject<EditorView | null>;
}

function MemoCard({ memo, onChange, onDelete, editorViewRef }: MemoCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const isNew = useRef(memo.content === '');

  // ── 自動高さ調整 ──
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, []);

  useEffect(() => { autoResize(); }, [memo.content, autoResize]);
  useEffect(() => { requestAnimationFrame(autoResize); }, [autoResize]);

  // ── 新規作成時にフォーカス ──
  useEffect(() => {
    if (isNew.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, []);

  // ── Blur で空メモ削除 ──
  const handleBlur = useCallback(() => {
    setFocused(false);
    if (memo.content.trim() === '') onDelete(memo.id);
  }, [memo.content, memo.id, onDelete]);

  // ── キーボード ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      (document.querySelector('.ProseMirror') as HTMLElement | null)?.focus();
    }
    e.stopPropagation();
  }, []);

  // ── ドラッグ ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const card = cardRef.current;
    const view = editorViewRef.current;
    if (!card || !view) return;
    const startY = e.clientY;

    const onMove = (ev: MouseEvent) => {
      card.style.transform = `translateY(${ev.clientY - startY}px)`;
      card.style.opacity = '0.7';
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      card.style.transform = '';
      card.style.opacity = '';

      // ドロップ位置の pos を取得してプラグインを直接更新
      const editorRect = view.dom.getBoundingClientRect();
      const x = editorRect.left + editorRect.width / 2;
      const coords = view.posAtCoords({ left: x, top: ev.clientY });
      if (coords) {
        view.dispatch(view.state.tr.setMeta(memoPluginKey, { memoId: memo.id, pos: coords.pos }));
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [memo.id, editorViewRef]);

  return (
    <div
      ref={cardRef}
      data-memo-id={memo.id}
      className={`memo-card memo-card--${memo.side}${focused ? ' memo-card--focused' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="memo-card-drag" onMouseDown={handleDragStart} />
      <button className="memo-card-delete" onClick={() => onDelete(memo.id)}>×</button>
      <textarea
        ref={textareaRef}
        className="memo-card-textarea"
        value={memo.content}
        placeholder="memo"
        rows={1}
        onChange={(e) => { onChange(memo.id, e.target.value); autoResize(); }}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
