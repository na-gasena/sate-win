import Database from '@tauri-apps/plugin-sql';
import { mkdir, exists, copyFile, remove, BaseDirectory } from '@tauri-apps/plugin-fs';

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let db: Database | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS files (
  file_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  title TEXT,
  first_line TEXT,
  current_path TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  content TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(file_id)
);
`;

// FTS5 virtual tables cannot use IF NOT EXISTS, so we guard manually.
// trigram トークナイザーを使用：3文字ずつずらしてインデックスを作るので、
// 日本語のようにスペースで区切らない言語でも任意の部分文字列で検索できる。
const FTS_SQL = `
CREATE VIRTUAL TABLE search_index USING fts5(
  file_id,
  content,
  tokenize='trigram'
);
`;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Open (or create) the SQLite database at the OS app-config directory
 * (macOS: `~/Library/Application Support/club.image.sate/sate.db`) and run
 * migrations. Returns the Database instance.
 *
 * vault フォルダの外に DB を置くことで、iCloud 同期や Obsidian と併用しても
 * バイナリの DB ファイルが同期対象に入らないようにしている。
 *
 * 旧バージョン（< 0.x）は `{vaultPath}/.sate/sate.db` に保存していたので、
 * 旧 DB が残っていれば一度だけ AppConfig に複製してから旧ディレクトリを削除する。
 */
export async function initDatabase(vaultPath: string): Promise<Database> {
  if (db) return db;

  await migrateLegacyDatabase(vaultPath);

  // tauri-plugin-sql の "sqlite:<filename>" は OS の AppConfig（macOS では
  // ~/Library/Application Support/{identifier}/）直下にファイルを作る。
  db = await Database.load('sqlite:sate.db');

  // Core tables
  await db.execute(SCHEMA_SQL);

  // 既存の files テーブルに private カラムが無ければ追加する軽量マイグレーション。
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(files)');
  if (!cols.some((c) => c.name === 'private')) {
    await db.execute('ALTER TABLE files ADD COLUMN private INTEGER NOT NULL DEFAULT 0');
  }

  // FTS5 — trigram トークナイザーで作成。
  // 既存テーブルがある場合はトークナイザーが違う可能性があるので再作成する。
  const ftsCheck = await db.select<{ sql: string }[]>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='search_index'"
  );
  if (ftsCheck.length === 0) {
    await db.execute(FTS_SQL);
  } else if (!ftsCheck[0].sql.includes('trigram')) {
    // 古いトークナイザーのテーブルがあれば作り直す
    await db.execute('DROP TABLE search_index');
    await db.execute(FTS_SQL);
  }

  return db;
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialised. Call initDatabase first.');
  return db;
}

/**
 * 旧配置（vault/.sate/sate.db）から新配置（AppConfig/sate.db）への一回限りの移行。
 * - AppConfig 側に sate.db が既にあれば何もしない（既に移行済みまたは新規環境）
 * - 旧 DB が無ければ何もしない（クリーンインストール）
 * - 旧 DB の本体に加えて、未チェックポイントの WAL/SHM があれば一緒に複製する
 *   （未保存のスナップショットを失わないため）
 * - 複製後に旧 .sate ディレクトリを削除して、iCloud 同期対象から外す
 */
async function migrateLegacyDatabase(vaultPath: string): Promise<void> {
  const newAlreadyExists = await exists('sate.db', { baseDir: BaseDirectory.AppConfig });
  if (newAlreadyExists) return;

  const legacyDir = `${vaultPath}/.sate`;
  const legacyDb = `${legacyDir}/sate.db`;
  const legacyExists = await exists(legacyDb);
  if (!legacyExists) return;

  // AppConfig ディレクトリを作る（無いと copyFile が失敗する）
  const appConfigDirExists = await exists('', { baseDir: BaseDirectory.AppConfig });
  if (!appConfigDirExists) {
    await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
  }

  for (const name of ['sate.db', 'sate.db-wal', 'sate.db-shm']) {
    const src = `${legacyDir}/${name}`;
    if (await exists(src)) {
      await copyFile(src, name, { toPathBaseDir: BaseDirectory.AppConfig });
    }
  }

  try {
    await remove(legacyDir, { recursive: true });
  } catch (err) {
    // 削除に失敗しても新 DB へのコピーは成功しているので、ユーザー操作は続行可能。
    // 残った .sate ディレクトリは手動で消してもらう。
    console.warn('Failed to remove legacy .sate directory:', err);
  }
}

// ---------------------------------------------------------------------------
// files table
// ---------------------------------------------------------------------------

export interface FileRecord {
  file_id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  first_line: string | null;
  current_path: string | null;
  /** 0 または 1（SQLite の INTEGER 真偽値） */
  private: number;
}

export async function upsertFile(
  fileId: string,
  createdAt: number,
  updatedAt: number,
  title: string | null,
  firstLine: string | null,
  currentPath: string | null,
  isPrivate: boolean,
): Promise<void> {
  const d = getDatabase();
  // プライベートなファイルは DB に本文の書き出しを残さない（万一DBが漏れても
  // プレビューからは内容を推測できないようにする）。
  const storedFirstLine = isPrivate ? null : firstLine;
  const priv = isPrivate ? 1 : 0;
  await d.execute(
    `INSERT INTO files (file_id, created_at, updated_at, title, first_line, current_path, private)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(file_id) DO UPDATE SET
       updated_at   = $3,
       title        = $4,
       first_line   = $5,
       current_path = $6,
       private      = $7`,
    [fileId, createdAt, updatedAt, title, storedFirstLine, currentPath, priv],
  );
}

export type FileSortOrder = 'created' | 'updated';

export async function getAllFiles(orderBy: FileSortOrder = 'created'): Promise<FileRecord[]> {
  const d = getDatabase();
  const column = orderBy === 'created' ? 'created_at' : 'updated_at';
  return d.select<FileRecord[]>(`SELECT * FROM files ORDER BY ${column} DESC`);
}

export async function getFileById(fileId: string): Promise<FileRecord | null> {
  const d = getDatabase();
  const rows = await d.select<FileRecord[]>(
    'SELECT * FROM files WHERE file_id = $1',
    [fileId],
  );
  return rows[0] ?? null;
}

export async function deleteFile(fileId: string): Promise<void> {
  const d = getDatabase();
  await d.execute('DELETE FROM snapshots WHERE file_id = $1', [fileId]);
  await d.execute('DELETE FROM search_index WHERE file_id = $1', [fileId]);
  await d.execute('DELETE FROM files WHERE file_id = $1', [fileId]);
}

// ---------------------------------------------------------------------------
// snapshots table
// ---------------------------------------------------------------------------

export interface SnapshotRecord {
  id: number;
  file_id: string;
  timestamp: number;
  content: string;
}

export async function addSnapshot(
  fileId: string,
  content: string,
): Promise<void> {
  const d = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  // Skip if latest snapshot has identical content
  const latest = await d.select<{ content: string }[]>(
    'SELECT content FROM snapshots WHERE file_id = $1 ORDER BY timestamp DESC LIMIT 1',
    [fileId],
  );
  if (latest.length > 0 && latest[0].content === content) return;

  await d.execute(
    'INSERT INTO snapshots (file_id, timestamp, content) VALUES ($1, $2, $3)',
    [fileId, now, content],
  );
}

export async function getSnapshots(fileId: string): Promise<SnapshotRecord[]> {
  const d = getDatabase();
  return d.select<SnapshotRecord[]>(
    'SELECT * FROM snapshots WHERE file_id = $1 ORDER BY timestamp ASC',
    [fileId],
  );
}

export async function getLatestSnapshot(
  fileId: string,
): Promise<SnapshotRecord | null> {
  const d = getDatabase();
  const rows = await d.select<SnapshotRecord[]>(
    'SELECT * FROM snapshots WHERE file_id = $1 ORDER BY timestamp DESC LIMIT 1',
    [fileId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// search_index (FTS5)
// ---------------------------------------------------------------------------

export async function updateSearchIndex(
  fileId: string,
  content: string | null,
): Promise<void> {
  const d = getDatabase();
  // FTS5 doesn't support UPSERT, so delete-then-insert
  await d.execute('DELETE FROM search_index WHERE file_id = $1', [fileId]);
  if (content === null) return; // プライベートなら索引を残さない
  await d.execute(
    'INSERT INTO search_index (file_id, content) VALUES ($1, $2)',
    [fileId, content],
  );
}

export interface SearchResult {
  file_id: string;
  snippet: string;
}

export async function searchFiles(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const d = getDatabase();

  if (q.length < 3) {
    // 1〜2文字: trigram が効かないので LIKE で部分一致検索（全行スキャン）。
    // 個人のテキストファイル程度の件数なら十分高速。
    // プライベートなファイルは索引自体に載っていないが、念のため JOIN で再除外する。
    return d.select<SearchResult[]>(
      `SELECT si.file_id, substr(si.content, max(1, instr(si.content, $1) - 16), 64) AS snippet
       FROM search_index si
       JOIN files f ON f.file_id = si.file_id
       WHERE si.content LIKE '%' || $1 || '%'
         AND f.private = 0`,
      [q],
    );
  }

  // 3文字以上: FTS5 trigram でフレーズ検索
  const escaped = q.replace(/"/g, '""');
  return d.select<SearchResult[]>(
    `SELECT si.file_id, snippet(search_index, 1, '【', '】', '…', 32) AS snippet
     FROM search_index si
     JOIN files f ON f.file_id = si.file_id
     WHERE search_index MATCH $1
       AND f.private = 0
     ORDER BY rank`,
    [`"${escaped}"`],
  );
}
