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
  /** プライベート指定。true のとき検索対象外＆一覧で内容プレビュー非表示 */
  private: boolean;
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
  if (meta.private) {
    data.private = true;
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

/** Read the header without changing line endings in the user's document body. */
function readFrontMatter(fileContent: string): {
  data: Record<string, unknown>;
  body: string;
} | null {
  const opening = /^\uFEFF?---\r?\n/.exec(fileContent);
  if (!opening) return null;
  const rest = fileContent.slice(opening[0].length);
  const closing = /(?:^|\r?\n)---(?:\r?\n|$)/.exec(rest);
  if (!closing) return null;

  try {
    const data: unknown = YAML.parse(rest.slice(0, closing.index));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    // Sate writes one empty separator line after the header.
    const body = rest.slice(closing.index + closing[0].length).replace(/^\r?\n/, '');
    return { data: data as Record<string, unknown>, body };
  } catch {
    return null;
  }
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
  const front = readFrontMatter(fileContent);
  if (!front) return { metadata: null, body: fileContent };
  const { data: parsed, body } = front;

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
      private: parsed.private === true,
    },
    body,
  };
}

/** Pure reconciliation step, shared by file imports and portability tests. */
export function prepareFrontMatter(
  fileContent: string,
  dates: { createdAt: string; updatedAt: string },
): { metadata: FileMetadata; body: string; content: string; injected: boolean } {
  const parsed = parseFrontMatter(fileContent);
  if (parsed.metadata) {
    return { metadata: parsed.metadata, body: parsed.body, content: fileContent, injected: false };
  }

  const front = readFrontMatter(fileContent);
  const data = { ...(front?.data ?? {}) };
  const body = front?.body ?? fileContent;
  if (typeof data.uuid !== 'string' || !data.uuid) data.uuid = crypto.randomUUID();
  if (typeof data.created !== 'string' || !data.created) data.created = dates.createdAt;
  if (typeof data.updated !== 'string' || !data.updated) data.updated = dates.updatedAt;
  const content = `---\n${YAML.stringify(data)}---\n\n${body}`;
  const completed = parseFrontMatter(content);
  if (!completed.metadata) throw new Error('Failed to prepare document metadata');
  return { metadata: completed.metadata, body, content, injected: true };
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
