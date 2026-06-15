/**
 * text-site への公開（射影）ロジック。
 *
 * Sate の .md を text-site の content/<slug>.md へ「射影」する。コピーではなく変換であり、
 * 公開して良いフィールドだけを書き出す（text-site spec §10）。
 *
 * 重要（事故防止）:
 * - uuid / updated / memos / private は **絶対に content/ へ書き出さない**。
 *   特に memos は私的な余白メモなので漏洩厳禁。
 * - Sate の `private` と text-site の `published` は別軸。private の裏返しを published にしない。
 * - 公開が世に出るのは git push → Cloudflare Pages CI。push は明示操作（publish_to_site が担う）。
 */

import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';

export type PublishStatus =
  | 'unpublished' // content/ にまだ無い
  | 'published-current' // 公開済みでローカルと一致
  | 'published-stale' // 公開済みだがローカルに未公開の変更あり
  | 'retracted'; // 公開停止中（published: false）

/** Sate のファイル名から slug を導出（拡張子を除いたもの）。これがそのまま URL になる。 */
export function deriveSlug(fileName: string): string {
  return fileName.replace(/\.md$/, '');
}

function contentDir(repoDir: string): string {
  return `${repoDir}/content`;
}

function contentPath(repoDir: string, slug: string): string {
  return `${contentDir(repoDir)}/${slug}.md`;
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
  /** ISO8601。無ければ slug 先頭の日付を date に使う */
  createdAt?: string | null;
}

/**
 * 公開用の frontmatter + 本文を組み立てる（Sate → content/ の射影）。
 * 出力するのは title（あれば）/ date / published のみ。
 */
export function projectToContent(input: PublishInput, published: boolean): string {
  const date = input.createdAt ? input.createdAt.slice(0, 10) : dateFromSlug(input.slug);
  const data: Record<string, unknown> = {};
  if (input.title) data.title = input.title;
  if (date) data.date = date;
  data.published = published;
  // 比較を安定させるため本文末尾の空白を 1 つの改行に正規化する。
  const body = input.body.replace(/\s*$/, '') + '\n';
  return `---\n${YAML.stringify(data)}---\n\n${body}`;
}

/** content/<slug>.md を読む。存在しなければ null。 */
export async function readSiteFile(repoDir: string, slug: string): Promise<string | null> {
  try {
    const p = contentPath(repoDir, slug);
    if (!(await exists(p))) return null;
    return await readTextFile(p);
  } catch {
    return null;
  }
}

/** content/ 側 md の frontmatter から published を読む。無ければ undefined。 */
function parsePublished(raw: string): boolean | undefined {
  if (!raw.startsWith('---\n')) return undefined;
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return undefined;
  try {
    const data = YAML.parse(raw.slice(4, end));
    if (data && typeof data.published === 'boolean') return data.published;
  } catch {
    // パース失敗は undefined 扱い
  }
  return undefined;
}

/**
 * 公開状態を判定する。
 * - content/ に無い → unpublished
 * - published: false → retracted（公開停止中）
 * - それ以外で、現ドキュメントの射影（published: true）と一致 → published-current
 * - 一致しない → published-stale（未公開の変更あり）
 */
export function computeStatus(siteRaw: string | null, projectedPublished: string): PublishStatus {
  if (siteRaw === null) return 'unpublished';
  if (parsePublished(siteRaw) === false) return 'retracted';
  return siteRaw === projectedPublished ? 'published-current' : 'published-stale';
}

/**
 * content/<slug>.md を書き出し、git commit & push する。
 * @returns push の出力（成功時）。失敗時は例外（メッセージは日本語）。
 */
export async function publishFile(
  repoDir: string,
  slug: string,
  raw: string,
  commitMessage: string,
): Promise<string> {
  try {
    await mkdir(contentDir(repoDir), { recursive: true });
  } catch {
    // 既に存在する場合など
  }
  await writeTextFile(contentPath(repoDir, slug), raw);
  return await invoke<string>('publish_to_site', {
    repoDir,
    relPath: `content/${slug}.md`,
    message: commitMessage,
  });
}
