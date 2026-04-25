import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RichDiffLine } from '../lib/diff';
import './RewindOverlay.css';

export interface RewindSnapshotMeta {
  id: number;
  timestamp: number;
}

interface RewindOverlayProps {
  snapshots: RewindSnapshotMeta[];
  currentIndex: number;
  diffLines: RichDiffLine[];
  onSelect: (index: number) => void;
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}`;
}

export default function RewindOverlay({
  snapshots,
  currentIndex,
  diffLines,
  onSelect,
}: RewindOverlayProps) {
  const total = snapshots.length;
  const safeIndex = Math.max(0, Math.min(currentIndex, total - 1));
  const current = snapshots[safeIndex];

  // 針の位置（0〜100%）。スナップショットが1つしかない場合は中央に。
  const needlePct = useMemo(() => {
    if (total <= 1) return 50;
    return (safeIndex / (total - 1)) * 100;
  }, [safeIndex, total]);

  // 「最後に変化があった行」のインデックス。スナップショット移動時にこの行を
  // 画面中央に持ってくる。変化がなければスクロールを一番下へ。
  const lastChangedIdx = useMemo(() => {
    for (let i = diffLines.length - 1; i >= 0; i--) {
      if (diffLines[i].segments.some((s) => s.tag === 'added')) return i;
    }
    return -1;
  }, [diffLines]);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const lastChangedRef = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (lastChangedIdx >= 0 && lastChangedRef.current) {
      const targetRect = lastChangedRef.current.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const offset =
        targetRect.top - previewRect.top - preview.clientHeight / 2 + targetRect.height / 2;
      preview.scrollTop += offset;
    } else {
      preview.scrollTop = preview.scrollHeight;
    }
  }, [lastChangedIdx, diffLines]);

  return (
    <div className="rewind-overlay">
      <div className="rewind-preview" ref={previewRef}>
        <div className="rewind-preview-inner">
          {diffLines.map((line, i) => {
            // 削除セグメントは描画しない（インラインの削除も「黙って消える」）
            const visible = line.segments.filter((s) => s.tag !== 'removed');
            if (visible.length === 0) return null;
            return (
              <p
                key={i}
                className="rewind-line"
                ref={i === lastChangedIdx ? lastChangedRef : null}
              >
                {visible.map((seg, j) => (
                  <span
                    key={j}
                    className={`rewind-seg rewind-seg--${seg.tag}`}
                  >
                    {seg.text || ' '}
                  </span>
                ))}
              </p>
            );
          })}
        </div>
      </div>

      <div className="rewind-scrubber">
        <div className="rewind-scrubber-info">
          <span className="rewind-scrubber-time">
            {current ? formatTime(current.timestamp) : ''}
          </span>
          <span className="rewind-scrubber-pos">
            {safeIndex + 1} / {total}
          </span>
        </div>
        <div className="rewind-scrubber-track">
          <div className="rewind-scrubber-line" />
          {snapshots.map((s, i) => {
            const left = total <= 1 ? 50 : (i / (total - 1)) * 100;
            const isActive = i === safeIndex;
            return (
              <button
                key={s.id}
                type="button"
                className={`rewind-tick${isActive ? ' rewind-tick--active' : ''}`}
                style={{ left: `${left}%` }}
                onClick={() => onSelect(i)}
                aria-label={formatTime(s.timestamp)}
                title={formatTime(s.timestamp)}
              />
            );
          })}
          <div
            className="rewind-needle"
            style={{ left: `${needlePct}%` }}
          />
        </div>
        <div className="rewind-scrubber-hint">
          Shift+Cmd+スクロールで移動 · Enter で復元 · Esc で戻る
        </div>
      </div>
    </div>
  );
}
