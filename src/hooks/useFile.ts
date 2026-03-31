import { useState, useRef, useCallback, useEffect } from 'react';
import {
  writeTextFile,
  readTextFile,
  readDir,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

function generateFileName(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureDir(subPath: string, baseDir: BaseDirectory): Promise<void> {
  const dirExists = await exists(subPath, { baseDir });
  if (!dirExists) {
    await mkdir(subPath, { baseDir, recursive: true });
  }
}

async function getNextFileName(
  subPath: string,
  baseDir: BaseDirectory
): Promise<string> {
  const datePrefix = generateFileName();

  try {
    await ensureDir(subPath, baseDir);

    const entries = await readDir(subPath, { baseDir });
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

interface UseFileOptions {
  baseDir: BaseDirectory;
  subPath: string;
}

export function useFile(options: UseFileOptions) {
  const { baseDir, subPath } = options;
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);

  contentRef.current = content;

  const initFile = useCallback(async () => {
    const name = await getNextFileName(subPath, baseDir);
    setFileName(name);
    setContent('');
  }, [subPath, baseDir]);

  const saveFile = useCallback(async () => {
    if (!fileName) return;
    setIsSaving(true);
    try {
      await ensureDir(subPath, baseDir);
      const filePath = `${subPath}/${fileName}`;
      await writeTextFile(filePath, contentRef.current, { baseDir });
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  }, [fileName, subPath, baseDir]);

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

  const openFile = useCallback(
    async (name: string) => {
      try {
        const filePath = `${subPath}/${name}`;
        const text = await readTextFile(filePath, { baseDir });
        setFileName(name);
        setContent(text);
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [subPath, baseDir]
  );

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
