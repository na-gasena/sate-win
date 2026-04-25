import { useState, useRef, useCallback, useEffect } from 'react';
import {
  writeTextFile,
  readTextFile,
  readDir,
  mkdir,
  exists,
  remove,
} from '@tauri-apps/plugin-fs';
import {
  type FileMetadata,
  type Memo,
  buildFrontMatter,
  parseFrontMatter,
  extractFirstLine,
} from '../lib/frontmatter';
import { upsertFile, updateSearchIndex, addSnapshot, deleteFile as deleteFileFromDb } from '../lib/db';

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


export function useFile(dirPath: string) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  // Editor を強制再マウントするためのキー（Rewind 復元時などに使う）
  const [reloadKey, setReloadKey] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  const memosRef = useRef<Memo[]>(memos);
  const privateRef = useRef(isPrivate);
  const metadataRef = useRef<FileMetadata | null>(null);

  contentRef.current = content;
  memosRef.current = memos;
  privateRef.current = isPrivate;

  const initFile = useCallback(async () => {
    const name = await getNextFileName(dirPath);
    setFileName(name);
    setContent('');
    setTitle(null);
    setMemos([]);
    setIsPrivate(false);
    setFileId(null);
    metadataRef.current = null;
  }, [dirPath]);

  const saveFile = useCallback(async (force = false) => {
    if (!fileName) return;
    const currentContent = contentRef.current;
    if (!currentContent && !force) return;

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
          title: null,
          memos: memosRef.current,
          private: privateRef.current,
        };
        setFileId(metadataRef.current.uuid);
      } else {
        metadataRef.current = {
          ...metadataRef.current,
          updatedAt: now,
          memos: memosRef.current,
          private: privateRef.current,
        };
      }

      const fileContent = buildFrontMatter(metadataRef.current) + currentContent;
      const filePath = `${dirPath}/${fileName}`;
      await writeTextFile(filePath, fileContent);

      // --- DB 更新 ---
      // ファイル保存が成功したら、DB側も同期する。
      // DB がまだ初期化されてない場合は静かにスキップ（起動直後など）。
      try {
        const meta = metadataRef.current;
        const createdAt = Math.floor(new Date(meta.createdAt).getTime() / 1000);
        const updatedAt = Math.floor(new Date(meta.updatedAt).getTime() / 1000);
        const firstLine = extractFirstLine(currentContent);

        await upsertFile(meta.uuid, createdAt, updatedAt, meta.title, firstLine, fileName, meta.private);
        // プライベートなファイルは全文索引を作らない（検索対象外にする）
        await updateSearchIndex(meta.uuid, meta.private ? null : currentContent);
        await addSnapshot(meta.uuid, fileContent);
      } catch {
        // DB未初期化の場合はここに来る。ファイル保存自体は成功してるので問題なし
      }
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
        setTitle(metadata?.title ?? null);
        setMemos(metadata?.memos ?? []);
        setIsPrivate(metadata?.private ?? false);
        setFileId(metadata?.uuid ?? null);
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

  const updateTitle = useCallback(
    (newTitle: string | null) => {
      setTitle(newTitle);
      if (metadataRef.current) {
        metadataRef.current = { ...metadataRef.current, title: newTitle };
      }
      // タイトル変更もオートセーブ対象
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveFile();
      }, 1500);
    },
    [saveFile]
  );

  const updateMemos = useCallback(
    (newMemos: Memo[]) => {
      setMemos(newMemos);
      memosRef.current = newMemos;
      // メモ変更もオートセーブ対象
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveFile();
      }, 1500);
    },
    [saveFile]
  );

  const deleteCurrentFile = useCallback(async () => {
    if (!fileName) return;

    // 進行中のオートセーブはキャンセルする（削除後に書き戻されるのを防ぐ）
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const filePath = `${dirPath}/${fileName}`;
      if (await exists(filePath)) {
        await remove(filePath);
      }
      const fileId = metadataRef.current?.uuid;
      if (fileId) {
        try {
          await deleteFileFromDb(fileId);
        } catch {
          // DB未初期化などは無視
        }
      }
    } catch (err) {
      console.error('Failed to delete file:', err);
      return;
    }

    await initFile();
  }, [fileName, dirPath, initFile]);

  const updatePrivate = useCallback(
    (next: boolean) => {
      setIsPrivate(next);
      privateRef.current = next;
      // プライベート状態の切り替えは即時反映したいので force 保存する。
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveFile(true);
    },
    [saveFile]
  );

  /**
   * スナップショット（フロントマター込みの全文）を現在のファイルに上書きする。
   *
   * 復元前の状態は呼び出し側で `saveFile(true)` 等で保存しておくこと。
   * メタデータ（uuid 等）は保ったまま、updatedAt のみ「今」に更新する。
   */
  const restoreSnapshot = useCallback(
    async (snapshotContent: string) => {
      if (!fileName) return;
      const { metadata, body } = parseFrontMatter(snapshotContent);
      if (!metadata) return;

      // 進行中のオートセーブを止める（古い content で上書きされないように）
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      // 現在の uuid を保ったまま、updatedAt を「今」に。
      const currentUuid = metadataRef.current?.uuid ?? metadata.uuid;
      const restored: FileMetadata = {
        ...metadata,
        uuid: currentUuid,
        updatedAt: new Date().toISOString(),
      };

      metadataRef.current = restored;
      contentRef.current = body;
      memosRef.current = restored.memos;
      privateRef.current = restored.private;

      setContent(body);
      setTitle(restored.title);
      setMemos(restored.memos);
      setIsPrivate(restored.private);
      setFileId(restored.uuid);
      setReloadKey((k) => k + 1);

      try {
        await ensureDir(dirPath);
        const fileContent = buildFrontMatter(restored) + body;
        const filePath = `${dirPath}/${fileName}`;
        await writeTextFile(filePath, fileContent);

        try {
          const createdAt = Math.floor(new Date(restored.createdAt).getTime() / 1000);
          const updatedAt = Math.floor(new Date(restored.updatedAt).getTime() / 1000);
          const firstLine = extractFirstLine(body);
          await upsertFile(restored.uuid, createdAt, updatedAt, restored.title, firstLine, fileName, restored.private);
          await updateSearchIndex(restored.uuid, restored.private ? null : body);
          await addSnapshot(restored.uuid, fileContent);
        } catch {
          // DB 未初期化などは無視（ファイル本体は更新済み）
        }
      } catch (err) {
        console.error('Failed to restore snapshot:', err);
      }
    },
    [fileName, dirPath],
  );

  return {
    fileName,
    fileId,
    content,
    title,
    memos,
    isPrivate,
    isSaving,
    reloadKey,
    updateContent,
    updateTitle,
    updateMemos,
    updatePrivate,
    openFile,
    saveFile,
    initFile,
    deleteCurrentFile,
    restoreSnapshot,
  };
}
