import { useState, useEffect, useRef, useCallback } from 'react';
import { type FileRecord, getAllFiles, searchFiles, getFileById } from '../lib/db';
import './FileOpenDialog.css';

interface FileOpenDialogProps {
  visible: boolean;
  dirPath: string;
  onOpen: (fileName: string) => void;
  onClose: () => void;
}

interface DisplayItem {
  file_id: string;
  name: string;
  preview: string | null;
  current_path: string | null;
  private: boolean;
}

function renderSnippet(text: string) {
  // 【マッチ部分】を下線付きspanに変換する
  const parts = text.split(/【|】/);
  // split結果: [前, マッチ, 後, マッチ, 後, ...] — 奇数indexがマッチ部分
  return parts.map((part, i) =>
    i % 2 === 1
      ? <span key={i} className="fileopen-match">{part}</span>
      : <span key={i}>{part}</span>
  );
}

export default function FileOpenDialog({ visible, dirPath, onOpen, onClose }: FileOpenDialogProps) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  // オーバーレイが開いたら検索欄にフォーカス & 一覧を取得
  useEffect(() => {
    if (!visible) {
      setQuery('');
      return;
    }
    inputRef.current?.focus();
    loadAllFiles();
  }, [visible, dirPath]);

  // クエリが変わるたびに検索 or 全件取得
  useEffect(() => {
    if (!visible) return;
    if (query.trim()) {
      doSearch(query.trim());
    } else {
      loadAllFiles();
    }
  }, [query, visible]);

  async function loadAllFiles() {
    try {
      const records = await getAllFiles();
      setItems(records.map(fileRecordToItem));
      setSelectedIndex(0);
    } catch {
      setItems([]);
      setSelectedIndex(0);
    }
  }

  async function doSearch(q: string) {
    try {
      const results = await searchFiles(q);
      // 検索結果から FileRecord を引いて表示用データを作る
      const displayItems: DisplayItem[] = [];
      for (const r of results) {
        const file = await getFileById(r.file_id);
        if (!file) continue;
        displayItems.push({
          file_id: file.file_id,
          name: file.title || file.current_path?.replace(/\.md$/, '') || '無題',
          preview: r.snippet,
          current_path: file.current_path,
          private: file.private === 1,
        });
      }
      setItems(displayItems);
      setSelectedIndex(0);
    } catch {
      setItems([]);
      setSelectedIndex(0);
    }
  }

  function fileRecordToItem(file: FileRecord): DisplayItem {
    const isPrivate = file.private === 1;
    return {
      file_id: file.file_id,
      name: file.title || file.current_path?.replace(/\.md$/, '') || '無題',
      // プライベート指定のファイルは一覧にプレビューを出さない
      preview: isPrivate ? null : file.first_line,
      current_path: file.current_path,
      private: isPrivate,
    };
  }

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // IME変換中のキー入力は無視（変換確定のEnterでファイルを開かないように）
      if (composingRef.current) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item?.current_path) {
          onOpen(item.current_path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [items, selectedIndex, onOpen, onClose]
  );

  if (!visible) return null;

  return (
    <div className="fileopen-overlay" onClick={onClose}>
      <div
        className="fileopen-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="fileopen-search">
          <input
            ref={inputRef}
            className="fileopen-search-input"
            type="text"
            placeholder="検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { setTimeout(() => { composingRef.current = false; }, 50); }}
          />
        </div>
        {items.length === 0 ? (
          <div className="fileopen-empty">
            {query ? '見つかりません' : 'ファイルがありません'}
          </div>
        ) : (
          <div className="fileopen-list">
            {items.map((item, i) => (
              <div
                key={item.file_id}
                ref={i === selectedIndex ? selectedItemRef : null}
                className={`fileopen-item${i === selectedIndex ? ' fileopen-item--selected' : ''}`}
                onClick={() => { if (item.current_path) { onOpen(item.current_path); onClose(); } }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="fileopen-item-name">
                  {item.private && <span className="fileopen-item-lock" aria-label="プライベート">🔒</span>}
                  {item.name}
                </div>
                {item.preview && (
                  <div className="fileopen-item-preview">{renderSnippet(item.preview)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
