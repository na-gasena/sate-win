import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { EditorView } from '@milkdown/prose/view';
import {
  type SearchStatus,
  subscribeSearchStatus,
  setSearchQuery,
  stepSearch,
  clearSearch,
  focusCurrentMatch,
} from './searchPlugin';
import './FindBar.css';

export interface FindRequest {
  seq: number;   // Cmd+F のたびに増える。開いたままでも再フォーカスさせるため
  seed: string;  // 検索欄に入れる初期値（エディタの選択テキスト）。空なら前回のクエリを使う
}

interface FindBarProps {
  request: FindRequest | null; // null なら非表示
  editorViewRef: React.RefObject<EditorView | null>;
  onClose: () => void;
}

export default function FindBar({ request, editorViewRef, onClose }: FindBarProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>({ current: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  useEffect(() => subscribeSearchStatus(setStatus), []);

  // 開いた（または Cmd+F を押し直した）ら検索欄にフォーカスして全選択
  const seq = request?.seq;
  const seed = request?.seed ?? '';
  useEffect(() => {
    if (seq == null) return;
    // seed が無ければ前回のクエリ（閉じても state に残っている）で再検索する
    const q = seed || inputRef.current?.value || '';
    setQuery(q);
    setSearchQuery(editorViewRef.current, q);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [seq, seed, editorViewRef]);

  // 閉じたらハイライトを消す
  const visible = request != null;
  useEffect(() => {
    if (visible) return;
    clearSearch(editorViewRef.current);
  }, [visible, editorViewRef]);

  if (!visible) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME変換中のキー入力は無視（変換確定の Enter で次のヒットへ飛ばないように）
    if (composingRef.current || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      stepSearch(editorViewRef.current, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      focusCurrentMatch(editorViewRef.current);
      onClose();
    }
  };

  return (
    <div className="find-bar" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="find-bar-input"
        type="text"
        placeholder="文書内を検索…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // IME変換中は未確定文字列で検索しない（確定時に compositionend で検索する）
          if (!(e.nativeEvent as InputEvent).isComposing) {
            setSearchQuery(editorViewRef.current, e.target.value);
          }
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          setSearchQuery(editorViewRef.current, e.currentTarget.value);
          setTimeout(() => { composingRef.current = false; }, 50);
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="find-bar-count">
        {query ? (status.total > 0 ? `${status.current} / ${status.total}` : 'なし') : ''}
      </span>
      <button
        className="find-bar-btn"
        aria-label="前へ"
        disabled={status.total === 0}
        onMouseDown={(e) => e.preventDefault()} // 検索欄のフォーカスを奪わない
        onClick={() => stepSearch(editorViewRef.current, -1)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="find-bar-btn"
        aria-label="次へ"
        disabled={status.total === 0}
        onMouseDown={(e) => e.preventDefault()} // 検索欄のフォーカスを奪わない
        onClick={() => stepSearch(editorViewRef.current, 1)}
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
