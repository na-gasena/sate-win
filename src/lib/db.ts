import Database from '@tauri-apps/plugin-sql';
import { mkdir } from '@tauri-apps/plugin-fs';

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
 * Open (or create) the SQLite database at `{vaultPath}/.sate/sate.db`
 * and run migrations. Returns the Database instance.
 */
export async function initDatabase(vaultPath: string): Promise<Database> {
  if (db) return db;

  const sateDir = `${vaultPath}/.sate`;
  await mkdir(sateDir, { recursive: true });

  db = await Database.load(`sqlite:${sateDir}/sate.db`);

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
