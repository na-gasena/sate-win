import { useState, useCallback } from 'react';
import { deriveSlug, runPublishCommand } from '../lib/publish';

/** 公開の実行結果。output はコマンドの出力（成功）またはエラーメッセージ。 */
export interface PublishResult {
  ok: boolean;
  output: string;
}

/**
 * 現在のドキュメントを公開コマンドに渡す。
 * 公開コマンドが未設定なら configured: false（公開 UI を出さない）。
 */
export function usePublish(
  publishCommand: string | undefined,
  fileName: string | null,
  title: string | null,
  content: string,
) {
  const [busy, setBusy] = useState(false);

  const publish = useCallback(async (): Promise<PublishResult> => {
    if (!publishCommand || !fileName) {
      return { ok: false, output: '公開コマンドが未設定です。' };
    }
    setBusy(true);
    try {
      const output = await runPublishCommand(publishCommand, {
        title,
        slug: deriveSlug(fileName),
        body: content,
      });
      return { ok: true, output };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    } finally {
      setBusy(false);
    }
  }, [publishCommand, fileName, title, content]);

  return {
    configured: !!publishCommand,
    busy,
    publish,
  };
}
