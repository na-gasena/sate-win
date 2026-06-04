/**
 * Reconcile（照合）— vault 内の .md ファイルと DB を同期する。
 *
 * 「.md ファイルが唯一の真実」という設計思想に基づいて、
 * ファイルシステム上の実態を正として DB を合わせる処理。
 *
 * やること:
 *  1. vault ディレクトリ内の .md ファイルを全部読む
 *  2. 各ファイルのフロントマター（uuid 等）をパースする
 *     - フロントマターが無い／壊れている場合は Sate のフロントマターを注入する
 *       (作成日時はファイルシステムの birthtime、更新日時は mtime を採用)
 *     - これにより Obsidian など外部エディタで作られたファイルも追跡対象に入る
 *  3. DB の files テーブルと突き合わせて INSERT or UPDATE
 *  4. ファイルが消えていたら DB からも DELETE（スナップショット履歴は残す）
 *  5. 全文検索インデックス（search_index）も更新
 *
 * これがあると:
 *  - DB を削除しても次の起動で自動復元される
 *  - Obsidian 等で外部編集されたファイルも反映される
 *  - iCloud 同期で別端末から増えたファイルも自動で取り込まれる
 */

import { readDir, readTextFile, writeTextFile, stat } from '@tauri-apps/plugin-fs';
import YAML from 'yaml';
import {
  parseFrontMatter,
  extractFirstLine,
  type FileMetadata,
} from './frontmatter';
import {
  getAllFiles,
  upsertFile,
  detachFile,
  updateSearchIndex,
  addSnapshot,
} from './db';

/**
 * フロントマターを保証する。
 *
 * - 既に Sate 形式（uuid / created / updated 揃い）のフロントマターがあればそのまま返す。
 * - 既存の YAML フロントマター（Obsidian の tags/aliases 等）があれば、それを
 *   保持したまま Sate に必要なフィールド（uuid/created/updated）を補完して書き戻す。
 * - フロントマターが全く無いファイルには新規にフロントマターを先頭に追加する。
 *
 * 作成日時はファイルシステムの birthtime、更新日時は mtime を使う。
 * 取れなければ「今」で代替する（ファイル本体の編集履歴は失われない）。
 */
async function ensureFrontMatter(
  filePath: string,
  fileContent: string,
): Promise<{ metadata: FileMetadata; body: string; injected: boolean }> {
  const parsed = parseFrontMatter(fileContent);
  if (parsed.metadata) {
    return { metadata: parsed.metadata, body: parsed.body, injected: false };
  }

  // FS から作成日時・更新日時を取る。stat が失敗したら「今」で代替。
  let birthtime: Date | null = null;
  let mtime: Date | null = null;
  try {
    const info = await stat(filePath);
    birthtime = info.birthtime ?? null;
    mtime = info.mtime ?? null;
  } catch {
    // 取得失敗時は now でフォールバック
  }
  const now = new Date();
  const createdDate = birthtime ?? mtime ?? now;
  const updatedDate = mtime ?? birthtime ?? now;

  // 既存 YAML フロントマターがあるか確認（Obsidian の tags 等を壊さないため）
  let existingYaml: Record<string, unknown> | null = null;
  let body = fileContent;
  if (fileContent.startsWith('---\n')) {
    const end = fileContent.indexOf('\n---\n', 4);
    if (end !== -1) {
      const fmRaw = fileContent.slice(4, end);
      try {
        const p = YAML.parse(fmRaw);
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          existingYaml = p as Record<string, unknown>;
          const rest = fileContent.slice(end + 5);
          body = rest.startsWith('\n') ? rest.slice(1) : rest;
        }
      } catch {
        // YAML 不正 → 既存ブロックは無視して先頭に新規追加する
      }
    }
  }

  // Sate に必要なフィールドを既存 YAML に上書き／追加。
  // 既存に uuid があれば再利用（同じファイルを再度 reconcile しても ID が変わらない）。
  const newYaml: Record<string, unknown> = { ...(existingYaml ?? {}) };
  const uuid =
    typeof newYaml.uuid === 'string' && newYaml.uuid
      ? newYaml.uuid
      : crypto.randomUUID();
  const createdStr =
    typeof newYaml.created === 'string' && newYaml.created
      ? newYaml.created
      : createdDate.toISOString();
  const updatedStr =
    typeof newYaml.updated === 'string' && newYaml.updated
      ? newYaml.updated
      : updatedDate.toISOString();

  newYaml.uuid = uuid;
  newYaml.created = createdStr;
  newYaml.updated = updatedStr;

  const newText = `---\n${YAML.stringify(newYaml)}---\n\n${body}`;
  await writeTextFile(filePath, newText);

  const metadata: FileMetadata = {
    uuid,
    createdAt: createdStr,
    updatedAt: updatedStr,
    title: typeof newYaml.title === 'string' ? newYaml.title : null,
    memos: [],
    private: newYaml.private === true,
  };
  return { metadata, body, injected: true };
}

export async function reconcile(vaultPath: string): Promise<void> {
  // -----------------------------------------------------------------------
  // Step 1: vault 内の .md ファイルを列挙
  // -----------------------------------------------------------------------
  const entries = await readDir(vaultPath);
  const mdFiles = entries.filter(
    (e) => e.name?.endsWith('.md') && e.isFile !== false,
  );

  // -----------------------------------------------------------------------
  // Step 2-3: 各ファイルを読んで DB に upsert
  // -----------------------------------------------------------------------
  // ファイルから見つかった uuid を集める（後で DB 側と比較して削除判定に使う）
  const foundIds = new Set<string>();

  for (const entry of mdFiles) {
    try {
      const filePath = `${vaultPath}/${entry.name}`;
      const text = await readTextFile(filePath);

      // フロントマターが無ければ注入する。注入後は parsed と同じ形で返ってくる。
      const { metadata, body, injected } = await ensureFrontMatter(filePath, text);

      foundIds.add(metadata.uuid);

      const createdAt = Math.floor(new Date(metadata.createdAt).getTime() / 1000);
      const updatedAt = Math.floor(new Date(metadata.updatedAt).getTime() / 1000);
      const firstLine = extractFirstLine(body);

      // DB に INSERT（新規）or UPDATE（既存）
      await upsertFile(
        metadata.uuid,
        createdAt,
        updatedAt,
        metadata.title,
        firstLine,
        entry.name!,
        metadata.private,
      );

      // Step 5: 全文検索インデックスも更新（プライベートなら索引を残さない）
      await updateSearchIndex(metadata.uuid, metadata.private ? null : body);

      // 新規取り込みファイルには初期スナップショットを 1 個だけ残す。
      // Rewind で「取り込み時点の状態」に戻れるようにするため。
      if (injected) {
        const fullText = await readTextFile(filePath);
        await addSnapshot(metadata.uuid, fullText);
      }
    } catch (err) {
      // 1ファイルの失敗で全体を止めない
      console.warn(`reconcile: skipped ${entry.name}:`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Step 4: DB にあるけどファイルが消えてるレコードを削除
  //
  // スナップショット履歴は意図的に消さない（detachFile）。
  // ファイルの消失が「保存バグによる上書き」や「同期の途中状態」だった場合、
  // 履歴が残っていれば本文を復元できる。履歴ごと消すと復元手段が絶たれる。
  // -----------------------------------------------------------------------
  const dbFiles = await getAllFiles();
  for (const record of dbFiles) {
    if (!foundIds.has(record.file_id)) {
      await detachFile(record.file_id);
    }
  }
}
