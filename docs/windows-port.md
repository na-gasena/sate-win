# Sate Windows移植・保守方針

調査日: 2026-10-20（JST）

調査対象: `5c8cacb5e441acff7433471c5176b9223592a4e7`（本家・fork双方の `main`）

目的: Sateの機能と文書形式を保ち、本家の更新を継続して取り込めるWindows版を育てる。

実装の進捗とWindowsでの実行手順は [Windows開発ガイド](windows.md) を参照。
以下は移植前の調査記録・方針。現時点の実装状況とは区別する。

## 1. 結論

Tauri 2 / React / Milkdownを維持し、OS依存部分だけを小さく分離する。
編集・検索・履歴・サイドメモをWindows用に複製しない。
本家と同じソースでmacOSもビルドできる構成を保つことが、将来のmerge負担を減らす。

「起動できた」を移植完了としない。文書とメタデータの互換性、日本語入力、
保存・復元、公開コマンド、更新インストールまでを受け入れ条件に含める。
今回は調査とGit運用の準備までで、アプリの実装変更は行っていない。

## 2. Gitの役割分担

| 名前 | 役割 |
|---|---|
| `upstream` | 本家 `https://github.com/sngazm/sate.git`。取得用。ローカルのpush URLは `DISABLED` |
| `origin` | 自分のfork `https://github.com/na-gasena/sate-win.git`。開発成果のpush先 |
| `main` | 本家 `main` の追従用。Windows固有のコミットは入れない |
| `windows` | Windows版の継続的な統合先。今回作成した開発ブランチ |
| `port/*`, `fix/*` | 必要になった時に `windows` から作る、作業単位の短期ブランチ |
| `sync/upstream-YYYY-MM-DD` | 本家更新のmergeと検証用に、一時的に作るブランチ |

調査時点で `main` と `upstream/main` の差分コミット数は `0 / 0`。
forkのGitHub上の既定ブランチは変更していない。
今回の `windows` はローカルに作成したもの。初回公開時は `git push -u origin windows` を使う。

ローカル設定は `remote.pushDefault=origin`、`push.default=simple`、`rerere.enabled=true`。
rerereは同じ競合の再解決を助けるが、解決結果のレビューと検証は必要。
これらの設定は別PCへcloneしても引き継がれない。
`main` への誤操作を強制的に禁止するブランチ保護は、今回設定していない。

### 本家を取り込む手順

作業ツリーをcleanにして、次の各段階が成功したことを確認してから次へ進む。
本家のタグも取得されるため、fork独自リリースには `windows-v*` など別のタグ系列を使う。

```powershell
git fetch upstream
git fetch origin
git switch main
git merge --ff-only upstream/main
git push origin main
git switch windows
git switch -c sync/upstream-YYYY-MM-DD
git merge --no-ff upstream/main
# 競合の意味を確認し、下記のビルド・回帰検証を行う
# 合格後だけwindowsへ反映する
git switch windows
git merge --ff-only sync/upstream-YYYY-MM-DD
git push origin windows
```

`main` のfast-forwardが失敗したら止まり、独自コミットやfork側の変更を確認する。
resetやforce pushで合わせない。検証中に `windows` が進んだ場合も最新状態との再検証が必要。

公開した `windows` を毎回rebaseせず、mergeで本家との祖先関係を残す。
本家の全コミットをcherry-pickする運用も避ける。
コミットは「OS設定」「キー操作」「公開コマンド」「データ互換性」など理由ごとに分ける。
本家の不具合修正や共通化は、Windows独自の配布設定と切り離し、将来本家へ提案できる形にする。

## 3. 現状と確認結果

### 構成

- フロントエンド: React 19 / TypeScript / Vite 8、エディタはMilkdown / ProseMirror。
- デスクトップ: Tauri 2。Rust独自コマンドはFinder表示と公開コマンド実行が中心。
- 文書: MarkdownとYAML frontmatter。UUID、日時、タイトル、Private、サイドメモを保持。
- DB: `tauri-plugin-sql` のSQLite。検索索引とスナップショットをアプリ設定領域に保存。
- I/O: Tauriのfs / dialog API。既にOS共通の仕組みが多い。
- 自動検証: `build` と `lint` のみ。単体テストやWindows向けCIは見当たらない。
- 配布: macOSのDMGのみ。既存workflowは `v*` タグで動く。

バージョンの根拠はmanifestの範囲指定ではなくロックファイル。
例えば `@milkdown/core` はmanifestでは `^7.19.2`、実際の固定版は `7.20.0`。
移植中に依存更新を同時に行わず、`pnpm-lock.yaml` と `Cargo.lock` を維持する。

### このWindows PCでの基準測定

| 項目 | 結果 |
|---|---|
| Node / pnpm | `24.15.0` / `11.25.0` |
| Rust | `1.98.1`、`stable-x86_64-pc-windows-msvc` |
| C++ Build Tools | Visual Studio 2022 BuildToolsのC++ツール導入を確認 |
| WebView2 Runtime | インストールを確認（`155.0.4283.62`） |
| `pnpm install --frozen-lockfile` | 成功。lockfile更新なし |
| `pnpm build` | 成功。JSチャンクが500 kBを超える警告あり |
| `pnpm lint` | 既存の19エラー・2警告。主にReact Hooks関連 |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml` | 失敗。`tauri-build` が要求する `icons/icon.ico` がないため停止 |
| 実アプリの起動・インストール・操作 | 未実施 |

Tauri公式のWindows前提条件はMSVCのC++ツールとWebView2。
開発用依存は揃っているが、インストーラー作成まで成功する保証ではない。
本家CIはNode 22 / pnpm 11なので、Windows CIもまず同系列に揃えて差を減らす。
ローカルのNode 24での成功をNode 22での確認の代わりにはしない。

既存lintの問題は移植前から存在する。大量のReact書き換えを移植パッチに混ぜない。
当初のCIでは既存結果と新規違反を区別し、build・データ互換性・追加部分の検証を必須にする。
lint全体を無効化せず、必要なら既存問題を別コミットで解消する。

## 4. OS依存・互換性の棚卸し

「確定」はコードまたは実測の根拠があるもの。「要検証」は実機確認が必要なもの。

| 領域 | 根拠と現状 | 対応方針 |
|---|---|---|
| ショートカット（確定） | `src/App.tsx` のアプリ操作・Rewindが `metaKey` 前提。ヘルプにもCmd/Optを直書き | 主修飾キー判定と表示名を共通化。WindowsはCtrl、macOSはCmd。AltGr・IME・WebViewの既定動作との衝突を検証 |
| 標準編集キー（要検証） | Milkdown / ProseMirror側のキー割り当てもある | アプリ側を置換するだけで完了としない。Undo/Redo、太字、見出し、リストを個別確認 |
| ファイル表示（確定） | `lib.rs` が `open -R`、`FileOpenDialog.tsx` が「Finderで開く」 | OS共通のreveal操作に集約し、macOSはFinder、WindowsはExplorerで対象を表示。日本語・空白・カンマを含むパスの引用も検証 |
| 公開（確定） | `$SHELL`、既定 `/bin/zsh`、`-lc`、`HOME` を使用 | 実行部分をOS別に分離。Windows標準のPowerShellを第一候補に実証。`pwsh` / Git Bash / WSLを必須にしない |
| 公開の互換性 | 設定は単一のコマンド文字列。UnixコマンドはWindowsでそのまま実行できない | `SATE_FILE` / `SATE_SLUG` / `SATE_TITLE`、生成md、終了コード・ログの契約を維持。OSごとのコマンド例を用意。GUI起動時のPATH、文字コード、コンソール窓の出現を確認 |
| ビルド・配布設定（確定） | `bundle.targets=["app"]`、`.ico`なし、CIはmacOSのみ。`cargo check` も `.ico` 不在で停止 | Windows用設定でNSISとWindowsアイコンを指定。元の設定・workflowとの差分を抑える |
| 保存先（確定） | `useSettings.ts` が `homeDir() + Documents/Sate` を組み立てる | `documentDir()` 等のOS APIを使う。OneDriveや移動済みDocumentsは要実機確認。既存設定の絶対パスは勝手に変更しない |
| パス・権限（要検証） | 複数箇所が文字列で `/` を連結。fsスコープはhome/document/appconfig中心 | 文字列の `/` だけでWindows不可とは断定しない。必要箇所をTauriの `join` に寄せ、日本語名・別ドライブ・選択先権限の再起動後の維持を確認。全面的な権限開放は避ける |
| 改行（確定） | `frontmatter.ts` / `reconcile.ts` が `---\n` と `\n---\n` のみ認識 | LF/CRLF、UTF-8 BOMの読み取り方針を統一し、パーサーとreconcileで同じ処理を使う |
| 保存と終了（要検証） | 保存は1.5秒のdebounce。明示的なclose要求のflush処理は見当たらない | 編集直後のAlt+F4・再起動・保存失敗・ファイル切替を検証。既存の保存/履歴の整合性を優先 |
| 表示・入力（要検証） | macOSはWebKit、WindowsはWebView2。游ゴシック系の指定は既存 | Microsoft IME、変換中のEnter、再変換、コピー、選択、DPI、フォントとメモ位置を確認 |
| 全画面・音（要検証） | 枠なし全画面を設定とRust setupの両方で指定。タイマーはWeb Audio | 起動・終了・タスク切替・複数モニター・スリープ復帰、タイマー音と音量を確認。Windows独自のUI追加は必要な場合に絞る |

### 最優先: CRLFでのメタデータ認識

同じfrontmatterを含む文字列をメモリ上だけで検証した結果:

```text
LF:   UUID、タイトル、private=true を認識
CRLF: metadata=null
```

`reconcile.ts` の補完処理もLFのみを認識するため、CRLF文書を
「frontmatterがない文書」と誤認して新たなブロックを追加する経路がある。
その経路では元のUUID・Private・メモの意味を保持できず、履歴の紐付けや検索除外にも影響し得る。
パーサーの再現は実測済み、reconcile経由の再書き込みと影響範囲はコード読解に基づく。
実ファイルでの検証は専用fixtureのコピーを使う。

これはWindowsに限らない共通の互換性修正として小さく切り出せる。
Gitのソース改行設定だけでは、ユーザーの文書ファイルの問題は解決しない。

## 5. 実装を分ける境界

追加を想定する場所（まだ作成していない）:

```text
src/lib/platform.ts                   OS判定・主修飾キー・表示名
src-tauri/src/platform/               reveal・公開シェルのOS別実装
src-tauri/tauri.windows.conf.json      Windowsのbundle・識別子・アイコン設定
.github/workflows/windows-ci.yml      Windows検証とインストーラー成果物
```

共通コンポーネントには細かなOS判定を散らさず、上記の短いインターフェースを使う。
Rustは `#[cfg(target_os = "windows")]` / macOS側の実装で分岐する。
ファイル表示はTauri Opener pluginのreveal機能も候補だが、依存追加とAPI対応を確認してから決定する。
過剰に汎用的な基盤を作らず、まず判明した差分だけを分離する。

Tauriは `tauri.windows.conf.json` を基本設定へ自動mergeできる。
ただし `bundle.icon` / `app.windows` などの配列は全体が置換されるため、
小さく上書きしたつもりで本家設定を失わないようにする。
上書き項目は本家更新のレビュー対象として記録する。

文書のfrontmatterとSQLiteスキーマは本家との共通契約として扱う。
Windows固有の文書形式や、メモ・Private情報を落とす簡易保存経路を作らない。
「mdからDBを再生成できる」は検索索引についての復旧策であり、過去のスナップショットの復旧策ではない。
DB移行時は履歴と必要なWALを含めたバックアップ・復元手順を別途検証する。

fork独自のアプリ識別子は、最初の常用データを作る前にWindows側で決める。
候補は `io.github.na-gasena.satewin`。これは未適用の案。
後から変更すると設定/DB領域の移行が必要になるため、毎リリース変更しない。
開発版は明示した別データ領域かテスト用Windowsユーザーで動かし、常用データと分ける。

## 6. 実施順と完了条件

1. **基準の固定（今回）**: ブランチとremote、調査対象SHA、既存build/lintの状態を記録。
2. **文書互換性の保護**: LF/CRLF/BOMのfrontmatterテストを先に追加し、読み取り・reconcileを共通化。
   UUID、タイトル、Private、メモ、本文が往復で保持され、再起動や再照合でも重複しないこと。
3. **Windows起動・ビルド基盤**: Windows設定とアイコン、Windows CIを追加。
   Windows x64を最初の検証対象とする。`cargo check --locked`、Tauriの実ビルド、NSIS生成の成功を別々に確認。
4. **操作とOS連携**: Ctrl系操作、Explorer表示、保存先、公開シェルを小さなコミットで対応。
   対象機能を無効化して移植完了とはしない。
5. **常用前の検証**: 下表を実機で実行し、インストール→更新で文書と履歴が残ることを確認。
   最初はWindows 11 x64を受け入れ環境とし、Windows 10 / ARM64等は実際に検証してから対応を宣言する。
6. **追従の実証**: 本家に更新が出たら検証用ブランチで一巡する。
   競合箇所と見落としたOS依存を記録し、保守手順を改善する。

### 継続して守る回帰項目

| 分類 | 合格条件 |
|---|---|
| 文書往復 | LF/CRLF/BOM、日本語、絵文字、空文書、タイトル、Private、メモの意味を保持 |
| 保存 | 新規・自動保存・Ctrl+S・即時切替・終了、保存先変更、失敗時の挙動で文書を失わない |
| 検索・履歴 | 一覧、全文検索、文書内検索、スナップショット、差分・復元。Privateの除外が有効 |
| IME・編集 | 確定/未確定Enter、Undo/Redo、改行・貼り付け・選択、ショートカット、サイドメモ |
| OS連携 | Explorer、別ドライブの保存先、再起動後のアクセス、全画面、DPI、タイマー音 |
| 公開 | 環境変数と公開mdが従来契約どおり。Privateとメモが漏れず、一時ファイルの片付け・失敗ログも確認 |
| 配布更新 | 新規インストール、同じ識別子での上書き更新、設定/履歴の保持、テスト用バックアップからの復元 |

自動化はまずデータ形式、修飾キー判定、公開md生成、シェル引数の境界へ集中する。
IMEとフォントは実機で確認する。自動UI検証を足してもIMEの確認を置き換えない。
CIはWindowsとmacOSのbuildを確認し、macOSでの手動操作未確認も明記する。
将来のWebDriverによるWindows UI検証は、安定したテストデータと起動手順ができてから追加する。

本家更新は週1回程度とリリース時を目安に手動で確認する。
本家の変更が少なければ空の作業を増やさず、通常の更新単位でまとめて検証する。
自動で本番ブランチへmergeする運用は初期には導入しない。

## 7. 配布と変更範囲のルール

- Windows CIはまず成果物をartifactとして出す。リリース公開をCI成功と同時に行わない。
- Windows独自リリースは `windows-v0.1.0-win.1` のようなタグ系列で、本家 `v*` と分ける。
- 元のmacOSリリースworkflowをWindows向けに書き換えず、Windows専用workflowを追加する。
- NSISを第一候補とし、MSI・ARM64・自動更新は必要性と検証範囲を確認してから広げる。
- 本家のREADME / specをWindows仕様に丸ごと書き換えず、この文書とWindows導入文書を追加する。
- ソースのLF固定を導入する場合は、`.gitattributes` と改行正規化の影響を確認し、機能変更と分ける。
- 個人向けの新機能追加とWindows移植は別コミット・別作業にし、本家との差の理由を追えるようにする。
- ライセンス表記を維持する。

## 8. 一次資料

- [Tauri: Windowsの前提条件](https://v2.tauri.app/start/prerequisites/#windows)
- [Tauri: プラットフォーム別設定とmerge規則](https://v2.tauri.app/develop/configuration-files/#platform-specific-configuration)
- [Tauri: Windows Installer（NSIS / MSI）](https://v2.tauri.app/distribute/windows-installer/)
- [本家](https://github.com/sngazm/sate) / [fork](https://github.com/na-gasena/sate-win)

本書のコード調査は冒頭のSHAを基準とする。本家更新時には実装と根拠を再確認する。
