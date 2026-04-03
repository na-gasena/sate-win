/**
 * フロントマターのパースとビルド。
 *
 * .md ファイルの先頭に YAML フロントマターが埋め込まれていて、
 * そこに uuid（ファイルの一意ID）や作成日時などのメタデータが入っている。
 * このモジュールはそのフロントマターを読み書きする共通処理。
 */

export interface FileMetadata {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  title: string | null;
}

/**
 * メタデータから YAML フロントマター文字列を組み立てる。
 *
 * 出力例:
 * ```
 * ---
 * uuid: abc-123
 * created: 2025-03-30T14:23:10
 * updated: 2025-03-30T14:23:10
 * title: 今日の日記
 * ---
 *
 * ```
 */
export function buildFrontMatter(meta: FileMetadata): string {
  let fm = `---\nuuid: ${meta.uuid}\ncreated: ${meta.createdAt}\nupdated: ${meta.updatedAt}\n`;
  if (meta.title) {
    fm += `title: ${meta.title}\n`;
  }
  fm += '---\n\n';
  return fm;
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
  const fm = fileContent.slice(4, end);
  const rest = fileContent.slice(end + 5); // skip '\n---\n'
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;

  const uuidMatch = fm.match(/^uuid:\s*(.+)$/m);
  const createdMatch = fm.match(/^created:\s*(.+)$/m);
  const updatedMatch = fm.match(/^updated:\s*(.+)$/m);
  const titleMatch = fm.match(/^title:\s*(.+)$/m);

  if (!uuidMatch || !createdMatch || !updatedMatch) {
    return { metadata: null, body: fileContent };
  }

  return {
    metadata: {
      uuid: uuidMatch[1].trim(),
      createdAt: createdMatch[1].trim(),
      updatedAt: updatedMatch[1].trim(),
      title: titleMatch ? titleMatch[1].trim() : null,
    },
    body,
  };
}

/**
 * 本文の1行目を取得する（ファイル一覧での表示用）。
 * 空行やMarkdownの見出し記号は除去する。
 */
export function extractFirstLine(body: string): string | null {
  for (const line of body.split('\n')) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}
