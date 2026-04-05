import { useCallback, useEffect, useRef, useState } from 'react';
import './TitleInput.css';

interface TitleInputProps {
  value: string | null;
  onChange: (title: string | null) => void;
}

export default function TitleInput({ value, onChange }: TitleInputProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = !!value;
  const visible = focused || hovered || hasValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(v || null);
    },
    [onChange]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
      editor?.focus();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      inputRef.current?.blur();
    }
  }, []);

  // マウスが近づいたときのホバー領域を広めに取る
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  // エディタから上矢印キーでタイトルにフォーカス
  useEffect(() => {
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp') return;

      const editor = document.querySelector('.ProseMirror');
      if (!editor || document.activeElement !== editor) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      // カーソルが最初のノードの先頭付近にいるか
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
    <div
      className={`title-input-area ${visible ? 'title-visible' : ''} ${hasValue && !focused && !hovered ? 'title-has-value' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <input
        ref={inputRef}
        className="title-input"
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder="題"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
