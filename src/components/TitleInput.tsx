import { useCallback, useEffect, useRef } from 'react';
import type { EditorView } from '@milkdown/prose/view';
import './TitleInput.css';

interface TitleInputProps {
  value: string | null;
  onChange: (title: string | null) => void;
  editorViewRef: React.MutableRefObject<EditorView | null>;
}

export default function TitleInput({ value, onChange, editorViewRef }: TitleInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(v || null);
    },
    [onChange]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
      editor?.focus();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      inputRef.current?.blur();
    }
  }, []);

  // エディタから上矢印キーでタイトルにフォーカス
  // capture phase で受けて、ProseMirror が処理する前に判定する。
  // 「最初の textblock の最上段 visual line」かつ IME 変換中でない場合のみ移動。
  useEffect(() => {
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp') return;
      if (e.isComposing || e.keyCode === 229) return;

      const view = editorViewRef.current;
      if (!view || view.isDestroyed) return;
      if (!view.hasFocus()) return;

      const { state } = view;
      const { $head, empty } = state.selection;
      if (!empty) return;
      if ($head.before(1) !== 0) return;
      if (!view.endOfTextblock('up')) return;

      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.focus();
    };

    document.addEventListener('keydown', handleEditorKeyDown, true);
    return () => document.removeEventListener('keydown', handleEditorKeyDown, true);
  }, [editorViewRef]);

  return (
    <div className="title-input-area">
      <input
        ref={inputRef}
        className="title-input"
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder=""
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
