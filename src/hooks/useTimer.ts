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
  // 効果音は <audio> 要素ではなく Web Audio API で鳴らす。
  // HTMLAudioElement だと WKWebView が macOS の Now Playing（メディアキー）に
  // アプリを登録してしまい、再生後にイヤホン等の再生ボタンを押すと
  // 効果音がもう一度鳴ってしまうため。Web Audio の出力はメディアキーに反応しない。
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startBufferRef = useRef<AudioBuffer | null>(null);
  const endBufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const load = async (url: string) => {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      return ctx.decodeAudioData(data);
    };
    load(START_SOUND_URL)
      .then((buf) => { startBufferRef.current = buf; })
      .catch(() => {});
    load(END_SOUND_URL)
      .then((buf) => { endBufferRef.current = buf; })
      .catch(() => {});

    return () => {
      audioCtxRef.current = null;
      ctx.close().catch(() => {});
    };
  }, []);

  const playBuffer = useCallback((buffer: AudioBuffer | null) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !buffer) return;
    // autoplay 制約で suspended のままの場合に備えて resume しておく。
    // タイマー開始はユーザー操作なので、ここで一度 running になれば
    // N 分後の終了音もそのまま鳴らせる。
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
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
      playBuffer(endBufferRef.current);
      setMode('completed');
    } else if (mode === 'extending') {
      playBuffer(endBufferRef.current);
      setMode('finished');
    }
  }, [remainingSeconds, mode, playBuffer]);

  const openSetting = useCallback(() => {
    setMode((m) => (m === 'idle' ? 'setting' : m));
  }, []);

  const closeSetting = useCallback(() => {
    setMode((m) => (m === 'setting' ? 'idle' : m));
  }, []);

  const playStartSound = useCallback(() => {
    // ユーザー操作のコンテキストで AudioContext が resume されるので、
    // 終了音のための事前アンロック（旧 primeEndSound）は不要になった。
    playBuffer(startBufferRef.current);
  }, [playBuffer]);

  const start = useCallback(
    (minutes: number) => {
      playStartSound();
      setEndTime(Date.now() + minutes * 60 * 1000);
      setRemainingSeconds(minutes * 60);
      setMode('running');
    },
    [playStartSound]
  );

  const extend = useCallback(
    (minutes: number) => {
      playStartSound();
      setEndTime(Date.now() + minutes * 60 * 1000);
      setRemainingSeconds(minutes * 60);
      setMode('extending');
    },
    [playStartSound]
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
