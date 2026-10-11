# 公開（公開コマンド）

書いた文書をブログや静的サイトなどへ公開するための汎用的な口。Sate は公開先を知らず、
「公開用の md を用意して、設定されたシェルコマンドに渡す」ところまでを担う。
実装は `src/lib/publish.ts`、`src/hooks/usePublish.ts`、`src-tauri/src/lib.rs`（`run_publish_command`）。

- 設定の「公開コマンド」が空なら公開機能は無効（ボタンも出ない）
- ファイルヘッダーのホバーメニューに「公開」ボタンが出る
- 押すと公開用 md を一時ファイルに書き出し、コマンドをログインシェル（`$SHELL -lc`）で実行する
  - GUI アプリは PATH が最小限なので、git / Homebrew / ssh-agent をシェルと同じように使うため
  - カレントディレクトリはホーム。実行後に一時ファイルは削除される
- コマンドには環境変数で以下を渡す

| 変数 | 内容 |
|---|---|
| `SATE_FILE` | 公開用 md の一時ファイルパス |
| `SATE_SLUG` | ファイル名から `.md` を除いたもの（例 `2026-10-07-001`） |
| `SATE_TITLE` | タイトル（無ければ空文字） |

- 公開用 md は frontmatter に `title`（あれば）と `date`（ファイル名先頭の日付）だけを持つ。
  `uuid` / `updated` / `memos` / `private` は **書き出さない**（余白メモの漏洩防止）
- Private 指定の文書は公開できない（警告して中断）
- コマンドの出力（stdout + stderr）は実行後にダイアログで表示する。終了コードが 0 以外なら失敗扱い
- 公開状態の表示や公開停止は持たない。必要ならコマンド側・公開先側で扱う

例: git で管理された静的サイトの `content/` に置いて push するスクリプト（設定に `~/my-site/publish.sh` と書く）

```sh
#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p content
cp "$SATE_FILE" "content/$SATE_SLUG.md"
git add "content/$SATE_SLUG.md"
git commit -m "公開: $SATE_SLUG" || true  # 変更が無ければ commit は失敗するので無視
git push
```
