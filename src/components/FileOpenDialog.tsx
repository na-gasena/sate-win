import { useState, useEffect, useRef, useCallback } from 'react';
import { type FileRecord, getAllFiles } from '../lib/db';
import './FileOpenDialog.css';

interface FileOpenDialogProps {
  visible: boolean;
  dirPath: string;
  onOpen: (fileName: string) => void;
  onClose: () => void;
}

export default function FileOpenDialog({ visible, dirPath, onOpen, onClose }: FileOpenDialogProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        // DB から取得（updated_at 降順で返ってくる）
        const records = await getAllFiles();
        setFiles(records);
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
        const file = files[selectedIndex];
        if (file?.current_path) {
          onOpen(file.current_path);
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
            {files.map((file, i) => (
              <div
                key={file.file_id}
                ref={i === selectedIndex ? selectedItemRef : null}
                className={`fileopen-item${i === selectedIndex ? ' fileopen-item--selected' : ''}`}
                onClick={() => { if (file.current_path) { onOpen(file.current_path); onClose(); } }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="fileopen-item-name">
                  {file.title || file.current_path?.replace(/\.md$/, '') || '無題'}
                </div>
                {file.first_line && (
                  <div className="fileopen-item-preview">{file.first_line}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
