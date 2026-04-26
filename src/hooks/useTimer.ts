import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerMode =
  | 'idle'
  | 'setting'
  | 'running'
  | 'completed'
  | 'extending'
  | 'finished';

export interface UseTimerResult {
  mode: TimerMode;
  remainingSeconds: number;
  openSetting: () => void;
  closeSetting: () => void;
  start: (minutes: number) => void;
  extend: (minutes: number) => void;
  end: () => void;
}

const START_SOUND_URL = '/se/BellTimerStart.wav';
const END_SOUND_URL = '/se/BellTimerEnd.wav';

export function useTimer(): UseTimerResult {
  const [mode, setMode] = useState<TimerMode>('idle');
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const endAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const startAudio = new Audio(START_SOUND_URL);
    startAudio.preload = 'auto';
    startAudioRef.current = startAudio;

    const endAudio = new Audio(END_SOUND_URL);
    endAudio.preload = 'auto';
    endAudioRef.current = endAudio;
  }, []);

  useEffect(() => {
    if (mode !== 'running' && mode !== 'extending') return;
    if (endTime === null) return;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [endTime, mode]);

  useEffect(() => {
    if (remainingSeconds !== 0) return;
    if (mode === 'running') {
      endAudioRef.current?.play().catch(() => {});
      setMode('completed');
    } else if (mode === 'extending') {
      endAudioRef.current?.play().catch(() => {});
      setMode('finished');
    }
  }, [remainingSeconds, mode]);

  const openSetting = useCallback(() => {
    setMode((m) => (m === 'idle' ? 'setting' : m));
  }, []);

  const closeSetting = useCallback(() => {
    setMode((m) => (m === 'setting' ? 'idle' : m));
  }, []);

  const playStartSound = useCallback(() => {
    const audio = startAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const primeEndSound = useCallback(() => {
    // ユーザー操作のコンテキストで終了音を一度ミュート再生してアンロックしておく。
    // Safari の autoplay 制約で N 分後の play() が拒否されないようにするため。
    const audio = endAudioRef.current;
    if (!audio) return;
    audio.muted = true;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
      });
  }, []);

  const start = useCallback(
    (minutes: number) => {
      playStartSound();
      primeEndSound();
      setEndTime(Date.now() + minutes * 60 * 1000);
      setRemainingSeconds(minutes * 60);
      setMode('running');
    },
    [playStartSound, primeEndSound]
  );

  const extend = useCallback(
    (minutes: number) => {
      playStartSound();
      primeEndSound();
      setEndTime(Date.now() + minutes * 60 * 1000);
      setRemainingSeconds(minutes * 60);
      setMode('extending');
    },
    [playStartSound, primeEndSound]
  );

  const end = useCallback(() => {
    setEndTime(null);
    setRemainingSeconds(0);
    setMode('idle');
  }, []);

  return {
    mode,
    remainingSeconds,
    openSetting,
    closeSetting,
    start,
    extend,
    end,
  };
}
