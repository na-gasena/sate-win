import { useCallback, useEffect, useMemo, useState } from 'react';
import EditorComponent from './components/Editor';
import WordCount from './components/WordCount';
import ShortcutHelp from './components/ShortcutHelp';
import { useFile } from './hooks/useFile';
import './App.css';

function App() {
  const { content, updateContent } = useFile();
  const [showShortcuts, setShowShortcuts] = useState(false);

  const charCount = useMemo(() => {
    return content.replace(/\s/g, '').length;
  }, [content]);

  const handleClick = useCallback(() => {
    if (showShortcuts) return;
    const el = document.querySelector('.ProseMirror') as HTMLElement | null;
    if (el && document.activeElement !== el) {
      el.focus();
    }
  }, [showShortcuts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '/') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
      if (e.key === 'Escape' && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts]);

  return (
    <div className="app" onClick={handleClick}>
      <div className="editor-container">
        <div className="editor-wrapper">
          <EditorComponent onChange={updateContent} />
        </div>
      </div>
      <WordCount count={charCount} />
      <ShortcutHelp visible={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

export default App;
