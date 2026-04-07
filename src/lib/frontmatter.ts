/**
 * フロントマターのパースとビルド。
 *
 * .md ファイルの先頭に YAML フロントマターが埋め込まれていて、
 * そこに uuid（ファイルの一意ID）や作成日時などのメタデータが入っている。
 * このモジュールはそのフロントマターを読み書きする共通処理。
 */

export interface Memo {
  id: string;
  side: 'left' | 'right';
  /** 紐づく段落のインデックス（0始まり）。フォールバック用 */
  paragraph: number;
  /** 紐づく段落の先頭テキスト。テキストマッチで段落を特定する */
  anchorText: string;
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
  if (meta.memos.length > 0) {
    fm += 'memos:\n';
    for (const m of meta.memos) {
      fm += `  - id: ${m.id}\n`;
      fm += `    side: ${m.side}\n`;
      fm += `    paragraph: ${m.paragraph}\n`;
      fm += `    anchorText: ${JSON.stringify(m.anchorText)}\n`;
      fm += `    content: ${JSON.stringify(m.content)}\n`;
    }
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

  // Parse memos block
  const memos: Memo[] = [];
  const memosBlockMatch = fm.match(/^memos:\n((?:  - .*\n(?:    .*\n)*)*)/m);
  if (memosBlockMatch) {
    const entries = memosBlockMatch[1].split(/  - /).filter(Boolean);
    for (const entry of entries) {
      const idM = entry.match(/^id:\s*(.+)$/m);
      const sideM = entry.match(/^side:\s*(.+)$/m);
      const paraM = entry.match(/^paragraph:\s*(.+)$/m);
      const anchorM = entry.match(/^anchorText:\s*(.+)$/m);
      const contentM = entry.match(/^content:\s*(.+)$/m);
      if (idM && sideM && paraM && contentM) {
        let content = contentM[1].trim();
        if (content.startsWith('"') && content.endsWith('"')) {
          try { content = JSON.parse(content); } catch { /* use as-is */ }
        }
        let anchorText = anchorM ? anchorM[1].trim() : '';
        if (anchorText.startsWith('"') && anchorText.endsWith('"')) {
          try { anchorText = JSON.parse(anchorText); } catch { /* use as-is */ }
        }
        memos.push({
          id: idM[1].trim(),
          side: sideM[1].trim() as 'left' | 'right',
          paragraph: parseInt(paraM[1].trim(), 10),
          anchorText,
          content,
        });
      }
    }
  }

  return {
    metadata: {
      uuid: uuidMatch[1].trim(),
      createdAt: createdMatch[1].trim(),
      updatedAt: updatedMatch[1].trim(),
      title: titleMatch ? titleMatch[1].trim() : null,
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
