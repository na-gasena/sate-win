# 通知制御

- アプリ起動中はmacOSの通知を抑制する
- 実装方針：AppleScriptまたはshellコマンドでフォーカスモードを制御
  ```bash
  osascript -e 'tell application "System Events" to keystroke "d" using {option down, command down}'
  ```
- 代替案：起動時にmacOSのフォーカスモードをオンにするよう促すダイアログを出す（一度だけ）
