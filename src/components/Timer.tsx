import { useEffect, useRef, useState } from 'react';
import { useTimer } from '../hooks/useTimer';
import './Timer.css';

const PRESETS = [5, 10, 15, 20, 25];
const EXTEND_OPTIONS = [1, 2, 3, 4, 5];

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Timer() {
  const {
    mode,
    remainingSeconds,
    openSetting,
    closeSetting,
    start,
    extend,
    end,
  } = useTimer();

  const [mouseActive, setMouseActive] = useState(false);
  const [minuteFlash, setMinuteFlash] = useState(false);
  const prevRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    let mouseTimer: number | undefined;
    // タイマー非表示時の起点座標。ここから50px以上動いたら初めて表示する。
    let anchor: { x: number; y: number } | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (anchor === null) {
        anchor = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = e.clientX - anchor.x;
      const dy = e.clientY - anchor.y;
      if (dx * dx + dy * dy < 50 * 50) return;

      setMouseActive(true);
      if (mouseTimer !== undefined) window.clearTimeout(mouseTimer);
      mouseTimer = window.setTimeout(() => {
        setMouseActive(false);
        // 次回また50px動かないと出ないように起点をリセット
        anchor = null;
      }, 2000);
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (mouseTimer !== undefined) window.clearTimeout(mouseTimer);
    };
  }, []);

  useEffect(() => {
    const prev = prevRemainingRef.current;
    prevRemainingRef.current = remainingSeconds;

    if (prev === null) return;
    if (remainingSeconds <= 0) return;
    if (prev % 60 !== 0 && remainingSeconds % 60 === 0) {
      setMinuteFlash(true);
      window.setTimeout(() => setMinuteFlash(false), 1500);
    }
  }, [remainingSeconds]);

  const isRunning = mode === 'running' || mode === 'extending';
  const showCountdown = isRunning && (mouseActive || minuteFlash);

  return (
    <>
      <div className="timer-anchor">
        {mode === 'idle' && (
          <button
            className="timer-clock-btn"
            onClick={(e) => {
              e.stopPropagation();
              openSetting();
            }}
            aria-label="タイマーを設定"
            title="タイマーを設定"
          >
            <ClockIcon />
          </button>
        )}

        {mode === 'setting' && (
          <div className="timer-setting" onClick={(e) => e.stopPropagation()}>
            <div className="timer-setting-label">タイマー</div>
            <div className="timer-setting-options">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  className="timer-preset-btn"
                  onClick={() => start(m)}
                >
                  {m}分
                </button>
              ))}
            </div>
            <button className="timer-setting-cancel" onClick={closeSetting}>
              キャンセル
            </button>
          </div>
        )}

        {isRunning && (
          <div
            className={`timer-countdown${showCountdown ? ' is-visible' : ''}`}
          >
            {formatTime(remainingSeconds)}
          </div>
        )}
      </div>

      {mode === 'completed' && (
        <div className="timer-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="timer-modal">
            <div className="timer-modal-title">タイマー終了</div>
            <div className="timer-modal-sub">続けますか？</div>
            <div className="timer-modal-extend">
              {EXTEND_OPTIONS.map((m) => (
                <button
                  key={m}
                  className="timer-modal-btn"
                  onClick={() => extend(m)}
                >
                  +{m}分
                </button>
              ))}
            </div>
            <button
              className="timer-modal-btn timer-modal-end"
              onClick={end}
            >
              セッション終了
            </button>
          </div>
        </div>
      )}

      {mode === 'finished' && (
        <div className="timer-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="timer-modal">
            <div className="timer-modal-title">タイマー終了</div>
            <div className="timer-modal-sub">お疲れさまでした</div>
            <button
              className="timer-modal-btn timer-modal-end"
              onClick={end}
              autoFocus
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}
