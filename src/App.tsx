import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EditorComponent from './components/Editor';
import TitleInput from './components/TitleInput';
import WordCount from './components/WordCount';
import ShortcutHelp from './components/ShortcutHelp';
import SettingsDialog from './components/SettingsDialog';
import FileOpenDialog from './components/FileOpenDialog';
import FileHeader from './components/FileHeader';
import SideMemoLayer from './components/SideMemoLayer';
import { useFile } from './hooks/useFile';
import { useSettings } from './hooks/useSettings';
import { initDatabase } from './lib/db';
import { reconcile } from './lib/reconcile';
import type { Memo } from './lib/frontmatter';
import './App.css';

function App() {
  const { settings, loaded, updateSettings } = useSettings();
  const { fileName, content, title, memos, isPrivate, updateContent, updateTitle, updateMemos, updatePrivate, saveFile, openFile, initFile, deleteCurrentFile } = useFile(settings?.baseDir ?? '');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFileOpen, setShowFileOpen] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const memosRef = useRef<Memo[]>(memos);
  memosRef.current = memos;
  const editorViewRef = useRef<import('@milkdown/prose/view').EditorView | null>(null);

  const charCount = useMemo(() => {
    if (!content) return 0;
    const paragraphs = content.split(/\n\n/);
    let count = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].replace(/<[^>]*>/g, '').replace(/\s/g, '');
      count += text.length;
      if (i < paragraphs.length - 1) count += 1;
    }
    return count;
  }, [content]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (showShortcuts || showSettings) return;
    const target = e.target as HTMLElement;
    if (target.closest('.title-input')) return;
    const el = document.querySelector('.ProseMirror') as HTMLElement | null;
    if (el && document.activeElement !== el) {
      el.focus();
    }
  }, [showShortcuts, showSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 's') { e.preventDefault(); saveFile(true); }
      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        if (content) {
          saveFile(true).then(() => {
            initFile();
            setTimeout(() => { (document.querySelector('.ProseMirror') as HTMLElement | null)?.focus(); }, 160);
          });
        }
      }
      if (e.metaKey && e.key === 'o') { e.preventDefault(); setShowFileOpen((v) => !v); }
      if (e.metaKey && e.key === '/') { e.preventDefault(); setShowShortcuts((v) => !v); }
      if (e.metaKey && e.key === ',') { e.preventDefault(); setShowSettings((v) => !v); }
      if (e.key === 'Escape') {
        if (showSettings) { e.preventDefault(); setShowSettings(false); }
        else if (showShortcuts) { e.preventDefault(); setShowShortcuts(false); }
        else if (showFileOpen) { e.preventDefault(); setShowFileOpen(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, showSettings, showFileOpen, saveFile, initFile, content]);

  useEffect(() => {
    if (!loaded || !settings) return;
    initDatabase(settings.baseDir)
      .then(() => reconcile(settings.baseDir))
      .catch((err) => console.error('Failed to init DB:', err));
  }, [loaded, settings]);

  if (!loaded || !settings) return null;

  return (
    <div className="app" onClick={handleClick}>
      <div className="editor-container" ref={editorContainerRef}>
        <div className="editor-wrapper">
          <TitleInput key={`title-${fileName}`} value={title} onChange={updateTitle} />
          <EditorComponent
            key={fileName}
            initialContent={content}
            onChange={updateContent}
            memosRef={memosRef}
            memos={memos}
            onMemosChange={updateMemos}
            editorViewRef={editorViewRef}
            containerRef={editorContainerRef}
          />
        </div>
        <SideMemoLayer
          key={`memos-${fileName}`}
          memos={memos}
          onChange={updateMemos}
          editorViewRef={editorViewRef}
        />
      </div>
      {fileName && (
        <FileHeader
          fileName={fileName}
          isPrivate={isPrivate}
          onTogglePrivate={updatePrivate}
          onDelete={deleteCurrentFile}
        />
      )}
      <WordCount count={charCount} />
      <ShortcutHelp visible={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <SettingsDialog
        visible={showSettings}
        settings={settings}
        onSave={updateSettings}
        onClose={() => setShowSettings(false)}
      />
      <FileOpenDialog
        visible={showFileOpen}
        dirPath={settings.baseDir}
        onOpen={openFile}
        onClose={() => setShowFileOpen(false)}
      />
    </div>
  );
}

export default App;
