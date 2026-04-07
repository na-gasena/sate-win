/**
 * メモ位置追跡プラグイン
 *
 * Widget Decoration は使わない。代わりに:
 * 1. Plugin state で各メモの doc 内 pos を Map<id, pos> で管理
 * 2. docChanged 時は tr.mapping.map() で自動追跡
 * 3. view.update コールバックで coordsAtPos → DOM 要素の style.top を直接設定
 *
 * React のレンダーサイクルを経由しないので、段落リフローと完全同期する。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { Memo } from '../lib/frontmatter';

export const memoPluginKey = new PluginKey<Map<string, number>>('memo-positions');

/** relativePos (0〜1) → ドキュメント pos */
function toAbsolutePos(doc: ProseMirrorNode, relativePos: number): number {
  const size = doc.content.size;
  if (size === 0) return 1;
  return Math.max(1, Math.min(Math.round(size * Math.max(0, Math.min(1, relativePos))), size));
}

/** memosRef から全メモの pos を計算 */
function computeAll(doc: ProseMirrorNode, memos: Memo[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const memo of memos) {
    m.set(memo.id, toAbsolutePos(doc, memo.relativePos));
  }
  return m;
}

/**
 * メモ位置追跡プラグインを作成する。
 *
 * - memosRef: 常に最新のメモ配列を指す ref
 * - containerRef: .editor-container の ref（座標変換用）
 */
export function createMemoPlugin(
  memosRef: React.RefObject<Memo[]>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  return new Plugin<Map<string, number>>({
    key: memoPluginKey,

    state: {
      init(_, state) {
        return computeAll(state.doc, memosRef.current ?? []);
      },
      apply(tr, old, _oldState, newState) {
        const meta = tr.getMeta(memoPluginKey);

        // 個別メモの移動
        if (meta && typeof meta === 'object' && 'memoId' in meta) {
          const next = new Map(old);
          next.set(meta.memoId as string, meta.pos as number);
          return next;
        }

        // メモ追加/削除 → 全再計算
        if (meta === true) {
          return computeAll(newState.doc, memosRef.current ?? []);
        }

        // テキスト編集 → mapping で追跡
        if (tr.docChanged) {
          const next = new Map<string, number>();
          for (const [id, pos] of old) {
            next.set(id, tr.mapping.map(pos));
          }
          return next;
        }

        return old;
      },
    },

    // view.update で DOM を直接操作して位置を同期
    view(editorView) {
      function syncDOM(view: typeof editorView) {
        const container = containerRef.current;
        if (!container) return;
        const positions = memoPluginKey.getState(view.state);
        if (!positions || positions.size === 0) return;

        const containerRect = container.getBoundingClientRect();

        for (const [memoId, pos] of positions) {
          const el = container.querySelector(`[data-memo-id="${memoId}"]`) as HTMLElement | null;
          if (!el) continue;
          try {
            const clampedPos = Math.max(1, Math.min(pos, view.state.doc.content.size));
            const coords = view.coordsAtPos(clampedPos);
            el.style.top = `${coords.top - containerRect.top}px`;
            if (!el.classList.contains('memo-card--positioned')) {
              el.classList.add('memo-card--positioned');
            }
          } catch {
            // 無効な pos（ドキュメント範囲外など）
          }
        }
      }

      // 初回: React がメモカードを描画するまで少し待つ
      const initTimer = setInterval(() => {
        const container = containerRef.current;
        if (!container) return;
        if (container.querySelector('[data-memo-id]')) {
          clearInterval(initTimer);
          syncDOM(editorView);
        }
      }, 50);
      setTimeout(() => clearInterval(initTimer), 3000); // 安全策

      return {
        update(view) { syncDOM(view); },
        destroy() { clearInterval(initTimer); },
      };
    },
  });
}

/** プラグインから位置マップを取得 */
export function getPositions(viewState: { plugins: readonly Plugin[] }): Map<string, number> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return memoPluginKey.getState(viewState as any) ?? undefined;
}

/** 位置マップから relativePos を同期。変更があれば新しい配列を返す */
export function syncPositionsToMemos(
  doc: ProseMirrorNode,
  memos: Memo[],
  positions: Map<string, number>,
): Memo[] | null {
  const size = doc.content.size;
  if (size === 0) return null;
  let changed = false;
  const updated = memos.map((m) => {
    const pos = positions.get(m.id);
    if (pos == null) return m;
    const newRel = Math.max(0, Math.min(1, pos / size));
    if (Math.abs(m.relativePos - newRel) > 0.001) {
      changed = true;
      return { ...m, relativePos: newRel };
    }
    return m;
  });
  return changed ? updated : null;
}
