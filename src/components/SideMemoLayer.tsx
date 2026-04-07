import { useCallback, useRef, useEffect, useState } from 'react';
import type { Memo } from '../lib/frontmatter';
import './SideMemoLayer.css';

/** アンカーテキストの最大長 */
const ANCHOR_TEXT_LEN = 20;

interface SideMemoLayerProps {
  memos: Memo[];
  onChange: (memos: Memo[]) => void;
  /** editor-container の ref。段落DOM取得の基準 */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/** ProseMirror 内の段落（p, h1-h6 等）要素を順番に取得 */
function getParagraphElements(container: HTMLElement): HTMLElement[] {
  const pm = container.querySelector('.ProseMirror');
  if (!pm) return [];
  return Array.from(pm.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > ul, :scope > ol, :scope > hr'));
}

/** 段落要素からプレーンテキストの先頭N文字を抽出 */
function extractAnchorText(el: HTMLElement): string {
  return (el.textContent ?? '').trim().slice(0, ANCHOR_TEXT_LEN);
}

/**
 * テキストマッチした候補の中で、保存済みインデックスに最も近いものを返す。
 * 同一書き出しの段落が複数あっても元の位置付近のものが選ばれる。
 */
function closestToSaved(candidates: number[], savedIndex: number): number {
  let best = candidates[0];
  let bestDist = Math.abs(best - savedIndex);
  for (let i = 1; i < candidates.length; i++) {
    const dist = Math.abs(candidates[i] - savedIndex);
    if (dist < bestDist) {
      best = candidates[i];
      bestDist = dist;
    }
  }
  return best;
}

/**
 * メモのアンカーテキストで段落を検索し、インデックスを返す。
 * 同じテキストの段落が複数あるとき、保存済みインデックスに近い方を優先。
 * 見つからなければ保存済みの paragraph インデックスにフォールバック。
 */
function resolveParagraphIndex(paragraphs: HTMLElement[], memo: Memo): number {
  if (memo.anchorText) {
    // 前方一致する候補を全て集める
    const exactCandidates: number[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const text = (paragraphs[i].textContent ?? '').trim();
      if (text.startsWith(memo.anchorText)) exactCandidates.push(i);
    }
    if (exactCandidates.length > 0) {
      return closestToSaved(exactCandidates, memo.paragraph);
    }

    // 部分一致の候補を集める（テキストが少し編集された場合）
    if (memo.anchorText.length >= 4) {
      const prefix = memo.anchorText.slice(0, Math.ceil(memo.anchorText.length / 2));
      const partialCandidates: number[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const text = (paragraphs[i].textContent ?? '').trim();
        if (text.includes(prefix)) partialCandidates.push(i);
      }
      if (partialCandidates.length > 0) {
        return closestToSaved(partialCandidates, memo.paragraph);
      }
    }
  }
  // テキストマッチ失敗 → インデックスでフォールバック（範囲内にクランプ）
  return Math.min(memo.paragraph, Math.max(paragraphs.length - 1, 0));
}

/** クリック位置から最も近い段落インデックスと段落内オフセット(0〜1)を返す */
function findNearestParagraph(container: HTMLElement, clientY: number): { index: number; offsetY: number } {
  const paragraphs = getParagraphElements(container);
  if (paragraphs.length === 0) return { index: 0, offsetY: 0 };

  let closest = 0;
  let minDist = Infinity;
  for (let i = 0; i < paragraphs.length; i++) {
    const rect = paragraphs[i].getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(clientY - center);
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }
  // 段落内の相対位置を算出
  const rect = paragraphs[closest].getBoundingClientRect();
  const offsetY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { index: closest, offsetY };
}

/** 段落インデックスと段落内オフセットから Y 座標（container 基準）を算出 */
function getYForParagraph(container: HTMLElement, paragraphIndex: number, offsetY: number): number | null {
  const paragraphs = getParagraphElements(container);
  const clamped = Math.min(paragraphIndex, paragraphs.length - 1);
  const el = paragraphs[clamped];
  if (!el) return null;
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - containerRect.top + container.scrollTop + elRect.height * offsetY;
}

/** メモ作成/移動時に anchorText と paragraph を設定して返す */
function attachAnchor(container: HTMLElement, memo: Omit<Memo, 'anchorText' | 'paragraph'>, paragraphIndex: number): Memo {
  const paragraphs = getParagraphElements(container);
  const clamped = Math.min(paragraphIndex, Math.max(paragraphs.length - 1, 0));
  const anchorText = paragraphs[clamped] ? extractAnchorText(paragraphs[clamped]) : '';
  return { ...memo, paragraph: clamped, anchorText };
}

/**
 * 全メモのアンカーを現在のDOM状態に合わせて更新する。
 * テキストマッチで段落を解決し、anchorText と paragraph を最新にする。
 * 変更があった場合だけ新しい配列を返す。
 */
function refreshAnchors(container: HTMLElement, memos: Memo[]): Memo[] | null {
  const paragraphs = getParagraphElements(container);
  if (paragraphs.length === 0) return null;

  let changed = false;
  const updated = memos.map((m) => {
    const resolved = resolveParagraphIndex(paragraphs, m);
    const newAnchor = paragraphs[resolved] ? extractAnchorText(paragraphs[resolved]) : '';
    if (m.paragraph !== resolved || m.anchorText !== newAnchor) {
      changed = true;
      return { ...m, paragraph: resolved, anchorText: newAnchor };
    }
    return m;
  });
  return changed ? updated : null;
}

export default function SideMemoLayer({ memos, onChange, containerRef }: SideMemoLayerProps) {
  // 段落位置が変わったら再計算するためのトリガー
  const [, setTick] = useState(0);
  const memosRef = useRef(memos);
  memosRef.current = memos;

  // MutationObserver: ProseMirror の DOM 変更を監視して位置を再計算 + アンカー更新
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const pm = container.querySelector('.ProseMirror');
    if (!pm) return;
    let anchorTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver((mutations) => {
      // 位置の再描画は常に行う
      setTick((t) => t + 1);

      // アンカーテキストを最新のDOMに合わせて更新（debounce）
      // 段落の追加/削除でも、段落内テキスト編集でも発火する
      if (memosRef.current.length > 0) {
        if (anchorTimer) clearTimeout(anchorTimer);
        anchorTimer = setTimeout(() => {
          const updated = refreshAnchors(container, memosRef.current);
          if (updated) onChange(updated);
        }, 2000);
      }
    });
    observer.observe(pm, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (anchorTimer) clearTimeout(anchorTimer);
    };
  }, [containerRef, onChange]);

  // --- ダブルクリックでメモ作成 ---
  const handleGutterDoubleClick = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const { index, offsetY } = findNearestParagraph(container, e.clientY);
      const newMemo = attachAnchor(
        container,
        { id: crypto.randomUUID().slice(0, 8), side, offsetY, content: '' },
        index,
      );
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

  // --- メモ削除 ---
  const handleDelete = useCallback(
    (id: string) => {
      onChange(memos.filter((m) => m.id !== id));
    },
    [memos, onChange]
  );

  // --- ドラッグで段落アンカーを変更 ---
  const handleDragStart = useCallback(
    (id: string, _startClientY: number) => {
      const container = containerRef.current;
      if (!container) return;

      const onMove = (ev: MouseEvent) => {
        const { index, offsetY } = findNearestParagraph(container, ev.clientY);
        onChange(memos.map((m) => {
          if (m.id !== id) return m;
          return attachAnchor(container, { ...m, offsetY }, index);
        }));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [memos, onChange, containerRef]
  );

  // --- 各メモの表示 Y 座標を算出（テキストアンカー → インデックスのフォールバック） ---
  const container = containerRef.current;
  const memoPositions = new Map<string, number>();
  if (container) {
    const paragraphs = getParagraphElements(container);
    for (const m of memos) {
      const resolvedIndex = resolveParagraphIndex(paragraphs, m);
      const y = getYForParagraph(container, resolvedIndex, m.offsetY);
      if (y != null) memoPositions.set(m.id, y);
    }
  }

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
              y={memoPositions.get(m.id) ?? 0}
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
              y={memoPositions.get(m.id) ?? 0}
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
  y: number;
  onChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, startClientY: number) => void;
}

function MemoItem({ memo, y, onChange, onDelete, onDragStart }: MemoItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const isNew = useRef(memo.content === '');

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
    if (isNew.current) {
      textareaRef.current?.focus();
    }
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
    // 空メモはフォーカスが外れたら削除
    if (memo.content.trim() === '') {
      onDelete(memo.id);
    }
  }, [memo.content, memo.id, onDelete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape → エディタにフォーカスを戻す
      if (e.key === 'Escape') {
        e.preventDefault();
        const el = document.querySelector('.ProseMirror') as HTMLElement | null;
        el?.focus();
      }
      // メモ内のキーイベントが親に伝搬しないようにする
      e.stopPropagation();
    },
    []
  );

  return (
    <div
      className={`side-memo side-memo--${memo.side}${focused ? ' side-memo--focused' : ''}`}
      style={{ top: y }}
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
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
