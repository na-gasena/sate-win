/**
 * 公開ロジック。
 *
 * Sate の .md を公開用の md へ「射影」し、ユーザーが設定した公開コマンドに渡す。
 * 公開先（どこへ・どう届けるか）は Sate は関知せず、コマンド側（例: text-site の publish.sh）に任せる。
 *
 * 重要（事故防止）:
 * - uuid / updated / memos / private は **絶対に公開用 md へ書き出さない**。
 *   特に memos は私的な余白メモなので漏洩厳禁。コマンド側に任せず Sate 側で落とす。
 */

import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';

/** Sate のファイル名から slug を導出（拡張子を除いたもの）。 */
export function deriveSlug(fileName: string): string {
  return fileName.replace(/\.md$/, '');
}

/** slug 先頭の日付（YYYY-MM-DD）を取り出す。Sate のファイル名は作成日始まりなので date 由来として使える。 */
function dateFromSlug(slug: string): string {
  const m = slug.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export interface PublishInput {
  title: string | null;
  slug: string;
  body: string;
}

/**
 * 公開用の frontmatter + 本文を組み立てる（Sate → 公開用 md の射影）。
 * 出力するのは title（あれば）/ date のみ。
 */
export function projectForPublish(input: PublishInput): string {
  const date = dateFromSlug(input.slug);
  const data: Record<string, unknown> = {};
  if (input.title) data.title = input.title;
  if (date) data.date = date;
  const body = input.body.replace(/\s*$/, '') + '\n';
  const front = Object.keys(data).length > 0 ? `---\n${YAML.stringify(data)}---\n\n` : '';
  return `${front}${body}`;
}

/**
 * 公開用 md を書き出して公開コマンドを実行する。
 * @returns コマンドの出力（成功時）。失敗時は例外（終了コードと出力を含む）。
 */
export async function runPublishCommand(command: string, input: PublishInput): Promise<string> {
  return await invoke<string>('run_publish_command', {
    command,
    slug: input.slug,
    title: input.title ?? '',
    content: projectForPublish(input),
  });
}
