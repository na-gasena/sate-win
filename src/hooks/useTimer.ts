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

const SOUND_URL = '/se/BellTinyStrike.wav';

export function useTimer(): UseTimerResult {
  const [mode, setMode] = useState<TimerMode>('idle');
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(SOUND_URL);
    audio.preload = 'auto';
    audioRef.current = audio;
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
      audioRef.current?.play().catch(() => {});
      setMode('completed');
    } else if (mode === 'extending') {
      audioRef.current?.play().catch(() => {});
      setMode('finished');
    }
  }, [remainingSeconds, mode]);

  const openSetting = useCallback(() => {
    setMode((m) => (m === 'idle' ? 'setting' : m));
  }, []);

  const closeSetting = useCallback(() => {
    setMode((m) => (m === 'setting' ? 'idle' : m));
  }, []);

  const primeAudio = useCallback(() => {
    const audio = audioRef.current;
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
      primeAudio();
      setEndTime(Date.now() + minutes * 60 * 1000);
      setRemainingSeconds(minutes * 60);
      setMode('running');
    },
    [primeAudio]
  );

  const extend = useCallback((minutes: number) => {
    setEndTime(Date.now() + minutes * 60 * 1000);
    setRemainingSeconds(minutes * 60);
    setMode('extending');
  }, []);

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
