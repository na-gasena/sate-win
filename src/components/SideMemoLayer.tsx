import { useCallback, useRef, useEffect, useState } from 'react';
import type { Memo } from '../lib/frontmatter';
import type { EditorView } from '@milkdown/prose/view';
import { memoPluginKey } from './memoDecorationPlugin';
import './SideMemoLayer.css';

/** エディタ水平中央の Y 座標にあたる doc 内 pos を取得 */
function posAtClientY(view: EditorView, clientY: number): number | null {
  const editorRect = view.dom.getBoundingClientRect();
  const x = editorRect.left + editorRect.width / 2;
  return view.posAtCoords({ left: x, top: clientY })?.pos ?? null;
}

interface SideMemoLayerProps {
  memos: Memo[];
  onChange: (memos: Memo[]) => void;
  editorViewRef: React.RefObject<EditorView | null>;
}

export default function SideMemoLayer({ memos, onChange, editorViewRef }: SideMemoLayerProps) {
  // ホバー判定は mouseenter/mouseleave や CSS の :hover に頼らない。
  // pointer-events: none のレイヤー上にカードを置いている構造だと、WebKit が
  // 「離れた」イベントを出さずハンドルが消えなくなる。ウインドウ全体の mousemove で
  // どのカードの矩形に入っているかを都度判定する。
  const layerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);

  /** 最後に観測したマウス座標で、どのカードに乗っているかを判定し直す */
  const recomputeHover = useCallback(() => {
    const layer = layerRef.current;
    const m = lastMouseRef.current;
    if (!layer || !m) return;
    let found: string | null = null;
    for (const el of layer.querySelectorAll<HTMLElement>('[data-memo-id]')) {
      const r = el.getBoundingClientRect();
      if (m.x >= r.left && m.x <= r.right && m.y >= r.top && m.y <= r.bottom) {
        found = el.dataset.memoId ?? null;
        break;
      }
    }
    setHoveredId((prev) => (prev === found ? prev : found));
  }, []);

  useEffect(() => {
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recomputeHover();
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [recomputeHover]);

  // ドロップ後はカードが行位置へスナップして動くのに、マウスは動かないので
  // 判定が走らない。位置確定後に最後の座標で判定し直す。
  const handleDragEnd = useCallback(() => {
    requestAnimationFrame(recomputeHover);
    setTimeout(recomputeHover, 100);
  }, [recomputeHover]);

  // ── ガターダブルクリックでメモ作成 ──
  const handleGutterDoubleClick = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      const view = editorViewRef.current;
      if (!view) return;
      const pos = posAtClientY(view, e.clientY);
      if (pos == null) return;
      const size = view.state.doc.content.size;
      const relativePos = size > 0 ? Math.max(0, Math.min(1, pos / size)) : 0;
      onChange([...memos, { id: crypto.randomUUID().slice(0, 8), side, relativePos, content: '' }]);
    },
    [memos, onChange, editorViewRef],
  );

  return (
    <div className="side-memo-layer" ref={layerRef}>
      <div className="side-memo-gutter side-memo-gutter-left" onDoubleClick={(e) => handleGutterDoubleClick('left', e)} />
      <div className="side-memo-gutter side-memo-gutter-right" onDoubleClick={(e) => handleGutterDoubleClick('right', e)} />
      {memos.map((m) => (
        <MemoCard
          key={m.id}
          memo={m}
          hovered={hoveredId === m.id}
          onTyping={() => setHoveredId(null)}
          onDragEnd={handleDragEnd}
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
  /** 親が mousemove で判定したホバー状態 */
  hovered: boolean;
  /** 入力が始まったら呼ぶ（ハンドルを引っ込める） */
  onTyping: () => void;
  /** ドラッグでの移動が確定したら呼ぶ */
  onDragEnd: () => void;
  onChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  editorViewRef: React.RefObject<EditorView | null>;
}

function MemoCard({ memo, hovered, onTyping, onDragEnd, onChange, onDelete, editorViewRef }: MemoCardProps) {
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
    // 書き始めたらハンドルは引っ込める（次にマウスが動いたら再表示）
    onTyping();
    if (e.key === 'Escape') {
      e.preventDefault();
      (document.querySelector('.ProseMirror') as HTMLElement | null)?.focus();
    }
    e.stopPropagation();
  }, [onTyping]);

  // ── ドラッグ ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const card = cardRef.current;
    const view = editorViewRef.current;
    if (!card || !view) return;
    const startY = e.clientY;
    // マウスはカード上端からこの距離分下にある。ドロップ時にこの分を差し引いて
    // カード上端の位置を基準に pos を解決することで見た目のズレを抑える。
    const mouseOffsetFromCardTop = startY - card.getBoundingClientRect().top;

    card.classList.add('memo-card--dragging');
    const onMove = (ev: MouseEvent) => {
      card.style.transform = `translateY(${ev.clientY - startY}px)`;
      card.style.opacity = '0.7';
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      card.style.transform = '';
      card.style.opacity = '';
      card.classList.remove('memo-card--dragging');

      // カードの上端が来るべき Y 座標 = マウス位置 - ハンドルまでのオフセット
      // posAtCoords は文字の行の上端にスナップする（行単位の離散化）
      const pos = posAtClientY(view, ev.clientY - mouseOffsetFromCardTop);
      if (pos != null) {
        view.dispatch(view.state.tr.setMeta(memoPluginKey, { memoId: memo.id, pos }));
      }
      onDragEnd();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [memo.id, editorViewRef, onDragEnd]);

  return (
    <div
      ref={cardRef}
      data-memo-id={memo.id}
      className={`memo-card memo-card--${memo.side}${focused ? ' memo-card--focused' : ''}${hovered ? ' memo-card--hover' : ''}`}
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
