import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from '@tauri-apps/plugin-dialog';

/** Alt+F4 and normal window close must wait for debounced and in-flight writes. */
export function useSaveOnClose(flush: () => Promise<boolean>) {
  useEffect(() => {
    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      try {
        if (await flush()) {
          await appWindow.destroy();
        } else {
          await message('文書を保存できませんでした。保存先の空き容量やアクセス権を確認してください。', {
            title: '保存に失敗しました', kind: 'error',
          });
        }
      } catch (error) {
        console.error('Failed to close window:', error);
      } finally {
        closing = false;
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((error) => console.error('Failed to register window close handler:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flush]);
}
