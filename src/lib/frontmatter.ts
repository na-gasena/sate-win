/**
 * フロントマターのパースとビルド。
 *
 * .md ファイルの先頭に YAML フロントマターが埋め込まれていて、
 * そこに uuid（ファイルの一意ID）や作成日時などのメタデータが入っている。
 * このモジュールはそのフロントマターを読み書きする共通処理。
 */

import YAML from 'yaml';

export interface Memo {
  id: string;
  side: 'left' | 'right';
  /** ドキュメント内の相対位置（0〜1）。doc.content.size に対する比率 */
  relativePos: number;
  content: string;
}

export interface FileMetadata {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  memos: Memo[];
}

/**
 * メタデータから YAML フロントマター文字列を組み立てる。
 */
export function buildFrontMatter(meta: FileMetadata): string {
  const data: Record<string, unknown> = {
    uuid: meta.uuid,
    created: meta.createdAt,
    updated: meta.updatedAt,
  };
  if (meta.title) {
    data.title = meta.title;
  }
  if (meta.memos.length > 0) {
    data.memos = meta.memos.map((m) => ({
      id: m.id,
      side: m.side,
      relativePos: m.relativePos,
      content: m.content,
    }));
  }
  return `---\n${YAML.stringify(data)}---\n\n`;
}

/**
 * ファイル全文からフロントマターを分離して、メタデータと本文に分ける。
 *
 * フロントマターは `---` で囲まれた YAML ブロック:
 * ```
 * ---
 * uuid: abc-123
 * created: ...
 * ---
 *
 * ここから本文
 * ```
 *
 * フロントマターがない場合は metadata が null になる。
 */
export function parseFrontMatter(fileContent: string): {
  metadata: FileMetadata | null;
  body: string;
} {
  if (!fileContent.startsWith('---\n')) {
    return { metadata: null, body: fileContent };
  }
  const end = fileContent.indexOf('\n---\n', 4);
  if (end === -1) {
    return { metadata: null, body: fileContent };
  }
  const fmRaw = fileContent.slice(4, end);
  const rest = fileContent.slice(end + 5); // skip '\n---\n'
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;

  let parsed: Record<string, unknown>;
  try {
    parsed = YAML.parse(fmRaw);
  } catch {
    return { metadata: null, body: fileContent };
  }

  if (!parsed || typeof parsed.uuid !== 'string' || !parsed.created || !parsed.updated) {
    return { metadata: null, body: fileContent };
  }

  const memos: Memo[] = [];
  if (Array.isArray(parsed.memos)) {
    for (const m of parsed.memos) {
      if (m && typeof m.id === 'string' && m.side && m.content != null) {
        memos.push({
          id: m.id,
          side: m.side as 'left' | 'right',
          relativePos: typeof m.relativePos === 'number' ? m.relativePos : 0,
          content: String(m.content),
        });
      }
    }
  }

  return {
    metadata: {
      uuid: String(parsed.uuid),
      createdAt: String(parsed.created),
      updatedAt: String(parsed.updated),
      title: typeof parsed.title === 'string' ? parsed.title : null,
      memos,
    },
    body,
  };
}

/**
 * 本文の書き出しを取得する（ファイル一覧での表示用）。
 * 複数段落にまたがるテキストをスペースで繋いで、最大100文字まで返す。
 * Markdownの見出し記号（#）は除去する。
 */
export function extractFirstLine(body: string, maxLength = 100): string | null {
  const parts: string[] = [];
  let total = 0;

  for (const line of body.split('\n')) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (!trimmed) continue;

    parts.push(trimmed);
    total += trimmed.length;
    if (total >= maxLength) break;
  }

  if (parts.length === 0) return null;

  const joined = parts.join(' ');
  return joined.length > maxLength ? joined.slice(0, maxLength) + '…' : joined;
}
