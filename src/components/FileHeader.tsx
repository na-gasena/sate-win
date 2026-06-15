import { Lock } from 'lucide-react';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import type { PublishStatus } from '../lib/publish';
import type { PublishResult } from '../hooks/usePublish';
import './FileHeader.css';

interface FileHeaderProps {
  fileName: string;
  isPrivate: boolean;
  onTogglePrivate: (next: boolean) => void;
  onDelete: () => void;
  // --- 公開（text-site 連携）---
  publishConfigured: boolean;
  publishStatus: PublishStatus;
  publishBusy: boolean;
  publishError: string | null;
  onPublish: () => Promise<PublishResult>;
  onRetract: () => Promise<PublishResult>;
}

const STATUS_LABEL: Record<PublishStatus, string> = {
  unpublished: '未公開',
  'published-current': '公開済み（最新）',
  'published-stale': '未公開の変更あり',
  retracted: '公開停止中',
};

/**
 * 右上のファイル名表示 + ホバーで出る属性メニュー。
 *
 * - 通常時はファイル名だけ表示（プライベート時は鍵アイコン付き）
 * - ホバー時はファイル名を含む同じカード内に属性トグル・公開操作が下に展開する。
 *   ファイル名とメニューを別要素にすると隙間でホバーが切れるので、
 *   ひとつのカードを膨らませる構造にしている。
 */
export default function FileHeader({
  fileName,
  isPrivate,
  onTogglePrivate,
  onDelete,
  publishConfigured,
  publishStatus,
  publishBusy,
  publishError,
  onPublish,
  onRetract,
}: FileHeaderProps) {
  const handleDelete = async () => {
    const ok = await confirm(`${fileName.replace(/\.md$/, '')} を削除しますか？`, {
      title: 'ファイルを削除',
      kind: 'warning',
      okLabel: '削除',
      cancelLabel: 'キャンセル',
    });
    if (ok) onDelete();
  };

  // 公開系の操作。private な文書の公開は安全弁で止める（text-site spec §10）。
  // Sate の private と web 公開は別軸なので、間違って公開しないよう警告して中断する。
  const guardPrivate = async (): Promise<boolean> => {
    if (!isPrivate) return true;
    await message(
      'このドキュメントは Private 指定です。Private は「Sate の検索・一覧から隠す」指定で、web 公開とは別物です。公開するにはまず Private を解除してください。',
      { title: '公開できません', kind: 'warning' },
    );
    return false;
  };

  // git の実行結果をダイアログで見せる（成功時はログ、失敗時はエラー全文）。
  const showResult = async (action: string, res: PublishResult) => {
    await message(res.output || (res.ok ? '完了しました。' : '失敗しました。'), {
      title: res.ok ? `${action}しました` : `${action}に失敗しました`,
      kind: res.ok ? 'info' : 'error',
    });
  };

  const handlePublish = async () => {
    if (!(await guardPrivate())) return;
    const res = await onPublish();
    await showResult('公開', res);
  };

  const handleRetract = async () => {
    const ok = await confirm(`${fileName.replace(/\.md$/, '')} の公開を停止しますか？（published: false で push します）`, {
      title: '公開を停止',
      kind: 'warning',
      okLabel: '公開停止',
      cancelLabel: 'キャンセル',
    });
    if (!ok) return;
    const res = await onRetract();
    await showResult('公開停止', res);
  };

  // ステータスごとの主アクションボタンのラベル
  const primaryLabel =
    publishStatus === 'unpublished'
      ? '公開'
      : publishStatus === 'published-stale'
        ? '更新'
        : publishStatus === 'retracted'
          ? '再公開'
          : null; // published-current は主アクション無し

  return (
    <div className="file-header">
      <div className="file-header-card">
        <div className="file-header-card-name">
          {isPrivate && <Lock className="file-header-lock" size={11} strokeWidth={1.75} aria-label="プライベート" />}
          <span className="file-header-name">{fileName.replace(/\.md$/, '')}</span>
        </div>
        <label className="file-header-card-row">
          <span className="file-header-menu-label">Private</span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => onTogglePrivate(e.target.checked)}
          />
        </label>

        {publishConfigured && (
          <div className="file-header-publish">
            <div className="file-header-publish-status">{STATUS_LABEL[publishStatus]}</div>
            <div className="file-header-publish-actions">
              {primaryLabel && (
                <button
                  type="button"
                  className="file-header-publish-btn"
                  onClick={handlePublish}
                  disabled={publishBusy}
                >
                  {publishBusy ? '処理中…' : primaryLabel}
                </button>
              )}
              {(publishStatus === 'published-current' || publishStatus === 'published-stale') && (
                <button
                  type="button"
                  className="file-header-publish-btn file-header-publish-retract"
                  onClick={handleRetract}
                  disabled={publishBusy}
                >
                  公開停止
                </button>
              )}
            </div>
            {publishError && <div className="file-header-publish-error">{publishError}</div>}
          </div>
        )}

        <button
          type="button"
          className="file-header-card-row file-header-delete"
          onClick={handleDelete}
        >
          <span className="file-header-menu-label">Delete</span>
        </button>
      </div>
    </div>
  );
}
