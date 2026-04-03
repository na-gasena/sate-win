/**
 * Reconcile（照合）— vault 内の .md ファイルと DB を同期する。
 *
 * 「.md ファイルが唯一の真実」という設計思想に基づいて、
 * ファイルシステム上の実態を正として DB を合わせる処理。
 *
 * やること:
 *  1. vault ディレクトリ内の .md ファイルを全部読む
 *  2. 各ファイルのフロントマター（uuid 等）をパースする
 *  3. DB の files テーブルと突き合わせて INSERT or UPDATE
 *  4. ファイルが消えていたら DB からも DELETE
 *  5. 全文検索インデックス（search_index）も更新
 *
 * これがあると:
 *  - DB を削除しても次の起動で自動復元される
 *  - Obsidian 等で外部編集されたファイルも反映される
 */

import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { parseFrontMatter, extractFirstLine } from './frontmatter';
import {
  getAllFiles,
  upsertFile,
  deleteFile,
  updateSearchIndex,
} from './db';

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
      const { metadata, body } = parseFrontMatter(text);

      // フロントマターがないファイルは Sate が作ったものではないのでスキップ
      if (!metadata) continue;

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
      );

      // Step 5: 全文検索インデックスも更新
      await updateSearchIndex(metadata.uuid, body);
    } catch (err) {
      // 1ファイルの失敗で全体を止めない
      console.warn(`reconcile: skipped ${entry.name}:`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Step 4: DB にあるけどファイルが消えてるレコードを削除
  // -----------------------------------------------------------------------
  const dbFiles = await getAllFiles();
  for (const record of dbFiles) {
    if (!foundIds.has(record.file_id)) {
      await deleteFile(record.file_id);
    }
  }
}
