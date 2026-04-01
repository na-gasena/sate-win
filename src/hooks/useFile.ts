import { useState, useRef, useCallback, useEffect } from 'react';
import {
  writeTextFile,
  readTextFile,
  readDir,
  mkdir,
  exists,
} from '@tauri-apps/plugin-fs';

interface FileMetadata {
  uuid: string;
  createdAt: string;
  updatedAt: string;
}

function generateDatePrefix(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  const dirExists = await exists(dirPath);
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function getNextFileName(dirPath: string): Promise<string> {
  const datePrefix = generateDatePrefix();

  try {
    await ensureDir(dirPath);

    const entries = await readDir(dirPath);
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

function buildFrontMatter(meta: FileMetadata): string {
  return `---\nuuid: ${meta.uuid}\ncreated: ${meta.createdAt}\nupdated: ${meta.updatedAt}\n---\n\n`;
}

function parseFrontMatter(fileContent: string): { metadata: FileMetadata | null; body: string } {
  if (!fileContent.startsWith('---\n')) {
    return { metadata: null, body: fileContent };
  }
  const end = fileContent.indexOf('\n---\n', 4);
  if (end === -1) {
    return { metadata: null, body: fileContent };
  }
  const fm = fileContent.slice(4, end);
  const rest = fileContent.slice(end + 5); // skip '\n---\n'
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;

  const uuidMatch = fm.match(/^uuid:\s*(.+)$/m);
  const createdMatch = fm.match(/^created:\s*(.+)$/m);
  const updatedMatch = fm.match(/^updated:\s*(.+)$/m);

  if (!uuidMatch || !createdMatch || !updatedMatch) {
    return { metadata: null, body: fileContent };
  }

  return {
    metadata: {
      uuid: uuidMatch[1].trim(),
      createdAt: createdMatch[1].trim(),
      updatedAt: updatedMatch[1].trim(),
    },
    body,
  };
}

export function useFile(dirPath: string) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  const metadataRef = useRef<FileMetadata | null>(null);

  contentRef.current = content;

  const initFile = useCallback(async () => {
    const name = await getNextFileName(dirPath);
    setFileName(name);
    setContent('');
    metadataRef.current = null;
  }, [dirPath]);

  const saveFile = useCallback(async () => {
    if (!fileName) return;
    const currentContent = contentRef.current;
    if (!currentContent) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setIsSaving(true);
    try {
      await ensureDir(dirPath);

      const now = new Date().toISOString();
      if (!metadataRef.current) {
        metadataRef.current = {
          uuid: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
      } else {
        metadataRef.current = { ...metadataRef.current, updatedAt: now };
      }

      const fileContent = buildFrontMatter(metadataRef.current) + currentContent;
      const filePath = `${dirPath}/${fileName}`;
      await writeTextFile(filePath, fileContent);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  }, [fileName, dirPath]);

  const updateContent = useCallback(
    (newContent: string) => {
      setContent(newContent);
      contentRef.current = newContent;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      if (newContent) {
        saveTimerRef.current = setTimeout(() => {
          saveFile();
        }, 1500);
      }
    },
    [saveFile]
  );

  const openFile = useCallback(
    async (name: string) => {
      try {
        const filePath = `${dirPath}/${name}`;
        const text = await readTextFile(filePath);
        const { metadata, body } = parseFrontMatter(text);
        setFileName(name);
        setContent(body);
        metadataRef.current = metadata;
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [dirPath]
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
