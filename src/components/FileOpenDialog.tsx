import { useState, useEffect, useRef, useCallback } from 'react';
import { readDir } from '@tauri-apps/plugin-fs';
import './FileOpenDialog.css';

interface FileOpenDialogProps {
  visible: boolean;
  dirPath: string;
  onOpen: (fileName: string) => void;
  onClose: () => void;
}

export default function FileOpenDialog({ visible, dirPath, onOpen, onClose }: FileOpenDialogProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const entries = await readDir(dirPath);
        const mdFiles = entries
          .filter((e) => e.name?.endsWith('.md'))
          .map((e) => e.name!)
          .sort()
          .reverse();
        setFiles(mdFiles);
        setSelectedIndex(0);
      } catch {
        setFiles([]);
        setSelectedIndex(0);
      }
    })();
  }, [visible, dirPath]);

  useEffect(() => {
    if (visible) {
      panelRef.current?.focus();
    }
  }, [visible]);

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, files.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (files[selectedIndex]) {
          onOpen(files[selectedIndex]);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [files, selectedIndex, onOpen, onClose]
  );

  if (!visible) return null;

  return (
    <div className="fileopen-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="fileopen-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div className="fileopen-title">ファイルを開く</div>
        {files.length === 0 ? (
          <div className="fileopen-empty">ファイルがありません</div>
        ) : (
          <div className="fileopen-list">
            {files.map((name, i) => (
              <div
                key={name}
                ref={i === selectedIndex ? selectedItemRef : null}
                className={`fileopen-item${i === selectedIndex ? ' fileopen-item--selected' : ''}`}
                onClick={() => { onOpen(name); onClose(); }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {name.replace(/\.md$/, '')}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
