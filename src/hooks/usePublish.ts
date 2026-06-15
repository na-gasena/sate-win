import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  deriveSlug,
  projectToContent,
  readSiteFile,
  computeStatus,
  publishFile,
  type PublishStatus,
} from '../lib/publish';

/** 公開/公開停止の実行結果。output は git の実行ログ（成功）またはエラーメッセージ。 */
export interface PublishResult {
  ok: boolean;
  output: string;
}

/**
 * 現在のドキュメントの text-site への公開状態を管理する。
 *
 * 公開状態（公開済み/未公開の変更あり/公開停止中）は **ステートレスに導出** する。
 * Sate 自身のフロントマターは汚さず、content/<slug>.md を 1 度だけ読み込んでキャッシュし、
 * 以後は現ドキュメントの射影結果（メモリ上で計算）と突き合わせて判定する。
 * これにより、打鍵のたびにディスクを読まなくても「未公開の変更あり」をライブ表示できる。
 */
export function usePublish(
  publishDir: string | undefined,
  fileName: string | null,
  title: string | null,
  content: string,
) {
  const [siteRaw, setSiteRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = fileName ? deriveSlug(fileName) : null;

  const refresh = useCallback(async () => {
    if (!publishDir || !slug) {
      setSiteRaw(null);
      return;
    }
    setSiteRaw(await readSiteFile(publishDir, slug));
  }, [publishDir, slug]);

  // ファイル切り替え・公開先変更時に content/ を読み直す
  useEffect(() => {
    setError(null);
    refresh();
  }, [refresh]);

  // 現ドキュメントを「公開する」とどうなるか（射影結果）。比較の基準にも使う。
  const projectedPublished = useMemo(() => {
    if (!slug) return '';
    return projectToContent({ title, slug, body: content }, true);
  }, [slug, title, content]);

  const status: PublishStatus = useMemo(
    () => computeStatus(siteRaw, projectedPublished),
    [siteRaw, projectedPublished],
  );

  const run = useCallback(
    async (published: boolean): Promise<PublishResult> => {
      if (!publishDir || !slug) {
        return { ok: false, output: '公開先（text-site リポジトリ）が未設定です。' };
      }
      setBusy(true);
      setError(null);
      try {
        const raw = projectToContent({ title, slug, body: content }, published);
        const label = published ? '公開' : '公開停止';
        const output = await publishFile(publishDir, slug, raw, `${label}: ${slug}`);
        setSiteRaw(raw);
        return { ok: true, output };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return { ok: false, output: msg };
      } finally {
        setBusy(false);
      }
    },
    [publishDir, slug, title, content],
  );

  const publish = useCallback(() => run(true), [run]);
  const retract = useCallback(() => run(false), [run]);

  return {
    configured: !!publishDir,
    status,
    busy,
    error,
    publish,
    retract,
    refresh,
  };
}
