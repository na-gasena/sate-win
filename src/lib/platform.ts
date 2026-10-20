export type DesktopPlatform = 'macos' | 'windows' | 'other';

export function detectPlatform(platform: string): DesktopPlatform {
  if (/mac/i.test(platform)) return 'macos';
  if (/win/i.test(platform)) return 'windows';
  return 'other';
}

export const desktopPlatform = detectPlatform(typeof navigator === 'undefined' ? '' : navigator.platform);
export const primaryModifierLabel = desktopPlatform === 'macos' ? 'Cmd' : 'Ctrl';
export const fileManagerLabel = desktopPlatform === 'macos' ? 'Finder' : desktopPlatform === 'windows' ? 'エクスプローラー' : 'ファイルマネージャー';

/** AltGr (Ctrl+Alt) and the Windows key must not trigger application shortcuts. */
export function hasPrimaryModifier(
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean },
  platform: DesktopPlatform = desktopPlatform,
): boolean {
  if (event.altKey) return false;
  return platform === 'macos' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function shortcutKeyLabel(key: string, platform: DesktopPlatform = desktopPlatform): string {
  if (key === 'Cmd') return platform === 'macos' ? 'Cmd' : 'Ctrl';
  if (key === 'Opt') return platform === 'macos' ? 'Opt' : 'Alt';
  return key;
}

/** Mouse wheels can report lines/pages, whereas touchpads usually report pixels. */
export function rewindWheelDelta(
  event: { deltaX: number; deltaY: number; deltaMode: number },
  pageHeight: number,
): number {
  const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
  return delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1);
}
