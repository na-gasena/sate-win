# Windows版の開発と確認

このforkの既定・開発ブランチは `windows`。`main` は本家追従用。
詳しい設計と更新手順は [移植・保守方針](windows-port.md) を参照。

## インストールとソースコード

[Windows版のReleases](https://github.com/na-gasena/sate-win/releases/latest) のAssetsから
`Sate_0.1.0_x64-setup.exe` をダウンロードして実行する。
`Source code (zip)` / `Source code (tar.gz)` は、そのReleaseのタグに対応するソースコード一式。
インストール済みアプリの利用には、以下の開発用ツールは不要。

## 開発に必要なもの

- Windows x64（初期の検証対象）。ARM64は未検証。
- Node.js 22.18以上とpnpm 11。
- Rust stableのMSVCツールチェーン。
- Visual Studio C++ Build Tools（Desktop development with C++、Windows SDK）。
- Microsoft Edge WebView2 Runtime。

## 開発

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm lint:check
pnpm tauri dev --config src-tauri/tauri.dev.conf.json
```

`tauri.dev.conf.json` は開発用のアプリ識別子とタイトル `Sate Dev` を使う。
初期保存先もWindowsのDocuments配下の `Sate Dev` になり、通常版の `Sate` と分離される。
既存の開発用設定があれば、その保存先が優先される。
開発用設定の保存先を常用フォルダーに変更すれば同じ文書を編集することになるため、テスト用フォルダーを使う。

```powershell
# 開発サーバーを使わない、配布形式と同じ埋め込みフロントエンドの検証
pnpm tauri build --debug --no-bundle --config src-tauri/tauri.dev.conf.json
# src-tauri/target/debug/sate.exe を起動

# 通常版のビルド
pnpm tauri build --bundles nsis
```

通常版の成果物:

```text
src-tauri/target/release/sate.exe
src-tauri/target/release/bundle/nsis/Sate_0.1.0_x64-setup.exe
```

`sate.exe` は単体で起動できるが、WebView2 Runtimeは必要。
インストーラーはユーザー単位のインストールを行う。現在はコード署名と自動更新を実装していない。
本家のDMG用workflowとリリースタグ系列は維持し、Windows CIはインストーラーをartifactとして保存する。
配布時はCI成功コミットに `windows-v*` タグを付け、そのCI成果物をGitHub Releaseに添付する。
ソースコードのZIP / tar.gzはGitHub標準のAssetsを使い、インストーラーと同じタグのソースを提供する。

## データとOSごとの差

| 項目 | Windows版 |
|---|---|
| 文書 | Windowsが返すDocumentsの下の `Sate`。設定から変更可能 |
| 設定・DB | `%APPDATA%\io.github.na-gasena.satewin\` |
| 開発版の設定・DB | `%APPDATA%\io.github.na-gasena.satewin.dev\` |
| 独自操作の主修飾キー | Ctrl。履歴はShift+Ctrl+スクロール |
| ファイル一覧の右クリック | エクスプローラーで対象を表示 |
| 公開コマンド | Windows PowerShell 5.1（プロファイル読み込みなし） |

移動済みDocumentsやOneDriveの配置はOS APIで取得する。
別ドライブなどを選んだ場合は、ファイルダイアログで許可されたアクセス範囲を永続化する。
通常版と開発版の識別子は以後固定する。変更すると設定とDBの移行が必要になる。

公開コマンド例（ローカルのスクリプトを呼ぶ）:

```powershell
& "$HOME/text-site/publish.ps1"
```

スクリプトでは `$env:SATE_FILE`、`$env:SATE_SLUG`、`$env:SATE_TITLE` を使う。
`SATE_FILE` はUTF-8の公開用Markdownで、コマンド終了後に一時フォルダーごと削除される。
本家と同様、公開mdには本文と公開用タイトル・日付だけを書き出す。
Private文書の公開は既存のUIで拒否する。サイドメモなどの内部メタデータは公開mdに含めない。
Unixのシェルスクリプトを自動変換する機能はない。
`.ps1` の実行可否はPCのPowerShellポリシーに従い、アプリから変更しない。

## 自動検証

```powershell
pnpm test
pnpm lint:check
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Node標準のテストランナーでLF/CRLF/BOM、UUID/Private/メモ、再照合の冪等性、
修飾キーとAltGr、ホイール単位、公開mdのメタデータ除外を検査する。
RustテストではWindows PowerShellを実行し、日本語・環境変数・終了コードと一時ファイルの片付けを確認する。
保存キューのテストでは、遅い保存が後続の保存を追い越さないことと、終了前の待機・失敗後の再試行を検査する。
既存のRust依存のバージョンは維持し、OS連携用の新規依存をCargo.lockへ追加している。

`pnpm lint` は本家由来の違反が残るため、現在も失敗する。
`pnpm lint:check` は `scripts/lint-baseline.json` の本家SHA時点のファイル・ルール・重大度ごとの件数を上限にする。
新しい種類・ファイルの違反や件数の増加はCIを失敗させる。
同じルール内で既存違反を置き換えたケースまでは検出できないため、diffのレビューも行う。
基準値を自動的に更新してエラーを隠さない。

### 2026-10-20の検証結果

- Nodeテスト19件、WindowsのRustテスト3件が成功。
- フロントエンドの型検査・ビルド、追加テスト自体の型検査が成功。
- `pnpm lint:check` が成功。現時点の既存違反は15エラー・2警告（調査時は19エラー・2警告）。
- `pnpm tauri build --bundles nsis` が成功し、実行ファイルとNSISインストーラーを生成。
- [Windows / macOSのCI](https://github.com/na-gasena/sate-win/actions/runs/39381519798) が成功。
- ユーザーによる実画面テストを実施済み（ユーザー確認）。
- インストール・上書き更新・macOSの実機動作は未確認。

今後の更新時も、次の項目を実機で継続して確認する。

## 継続して確認する実機項目

- Microsoft IME / ATOKでの変換、再変換、確定時Enter、貼り付けとUndo/Redo。
- 全画面・複数モニター・DPI・タイマー音・スリープ復帰。
- 文書切替・復元・編集直後Alt+F4と、ディスク不足や権限エラー時の挙動。
- 別ドライブの保存先を選び、再起動後も読み書きできること。
- 新規インストール→上書き更新で、設定・文書・スナップショットが保持されること。
- macOS実機の回帰確認。Windows上の成功をmacOSでの確認の代わりにしない。

正常な終了要求では保留中・実行中の保存を待ち、保存失敗なら閉じない。
タスクの強制終了、OS停止、停電に対する保存保証や原子的な置換保存は別途検証・改善が必要。
SQLiteは文書の検索索引だけでなく履歴も保持するため、バックアップでは文書とDB双方を保存する。

## 参照

- [TauriのWindows前提条件](https://v2.tauri.app/start/prerequisites/#windows)
- [TauriのOS別設定](https://v2.tauri.app/develop/configuration-files/#platform-specific-configuration)
- [Tauri Opener](https://v2.tauri.app/plugin/opener/)
- [Tauri Persisted Scope](https://v2.tauri.app/plugin/persisted-scope/)
