import { useCallback, useEffect, useRef } from 'react';
import './TitleInput.css';

interface TitleInputProps {
  value: string | null;
  onChange: (title: string | null) => void;
}

export default function TitleInput({ value, onChange }: TitleInputProps) {
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
  useEffect(() => {
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp') return;

      const editor = document.querySelector('.ProseMirror');
      if (!editor || document.activeElement !== editor) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const firstChild = editor.firstChild;
      if (!firstChild) return;

      if (
        range.startContainer === editor ||
        range.startContainer === (firstChild as Node) ||
        (range.startContainer.parentNode === (firstChild as Node) && range.startOffset === 0)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEditorKeyDown);
    return () => document.removeEventListener('keydown', handleEditorKeyDown);
  }, []);

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
