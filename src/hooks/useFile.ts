import { useState, useRef, useCallback, useEffect } from 'react';
import {
  writeTextFile,
  readTextFile,
  readDir,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

const SAVE_DIR = 'Sate';

function generateFileName(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function getNextFileName(): Promise<string> {
  const datePrefix = generateFileName();
  const dirPath = SAVE_DIR;

  try {
    const dirExists = await exists(dirPath, { baseDir: BaseDirectory.Document });
    if (!dirExists) {
      await mkdir(dirPath, { baseDir: BaseDirectory.Document, recursive: true });
    }

    const entries = await readDir(dirPath, { baseDir: BaseDirectory.Document });
    const todayFiles = entries
      .filter((e) => e.name?.startsWith(datePrefix) && e.name?.endsWith('.md'))
      .map((e) => e.name!)
      .sort();

    let nextNum = 1;
    if (todayFiles.length > 0) {
      const lastFile = todayFiles[todayFiles.length - 1];
      const match = lastFile.match(/-(\d{3})\.md$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    const numStr = String(nextNum).padStart(3, '0');
    return `${datePrefix}-${numStr}.md`;
  } catch {
    return `${datePrefix}-001.md`;
  }
}

export function useFile() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);

  contentRef.current = content;

  const initFile = useCallback(async () => {
    const name = await getNextFileName();
    setFileName(name);
    setContent('');
  }, []);

  const saveFile = useCallback(async () => {
    if (!fileName) return;
    setIsSaving(true);
    try {
      const filePath = `${SAVE_DIR}/${fileName}`;
      await writeTextFile(filePath, contentRef.current, {
        baseDir: BaseDirectory.Document,
      });
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  }, [fileName]);

  const updateContent = useCallback(
    (newContent: string) => {
      setContent(newContent);
      contentRef.current = newContent;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveFile();
      }, 1500);
    },
    [saveFile]
  );

  const openFile = useCallback(async (name: string) => {
    try {
      const filePath = `${SAVE_DIR}/${name}`;
      const text = await readTextFile(filePath, {
        baseDir: BaseDirectory.Document,
      });
      setFileName(name);
      setContent(text);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, []);

  useEffect(() => {
    initFile();
  }, [initFile]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    fileName,
    content,
    isSaving,
    updateContent,
    openFile,
    saveFile,
    initFile,
  };
}
