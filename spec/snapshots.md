# スナップショット（バージョン履歴）

## データ設計の思想

**`.mdファイルが唯一の真実（Single Source of Truth）`**

- ローカルの`.md`ファイルが常に正であり、DBはそれを便利にするためのキャッシュに過ぎない
- `sate.db`はいつでも削除・再生成できる。アプリ起動時にvault内の`.md`ファイルをスキャンすれば完全に復元できる
- Obsidianと同じ思想。ファイルはSateがなくても読める、編集できる、移行できる

この思想に基づき：
- DBに保存する情報は`.md`ファイルから導出できるものだけ
- DBが壊れてもデータは失われない
- 別のエディタで編集された`.md`ファイルも、次回起動時にDBに反映される

## 方針
- ユーザーが意識することなく、裏で自動的にスナップショットを蓄積する
- 上限なし。テキストは軽いので容量の心配は不要
- アプリ専用ディレクトリ配下の `sate.db`（SQLite）に保存
  - macOS: `~/Library/Application Support/club.image.sate/sate.db`
  - vault は `.md` のみで構成され、DB は同期対象外（iCloud / Obsidian と併用しても影響しない）

## DBスキーマ

実装は `src/lib/db.ts`（`tauri-plugin-sql`）。

```sql
CREATE TABLE files (
  file_id TEXT PRIMARY KEY,  -- フロントマターのUUIDそのまま
  created_at INTEGER,
  updated_at INTEGER,
  title TEXT,                -- フロントマターのtitle（NULLも可）
  first_line TEXT,           -- 本文の書き出し行（一覧表示用キャッシュ。privateならNULL）
  current_path TEXT,         -- ファイルの現在のパス
  private INTEGER NOT NULL DEFAULT 0  -- プライベート指定（後発の軽量マイグレーションで追加）
);

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT,              -- files.file_idと紐付け
  timestamp INTEGER,         -- Unixタイムスタンプ
  content TEXT,              -- フルテキスト（フロントマター含む）
  FOREIGN KEY (file_id) REFERENCES files(file_id)
);

-- trigram トークナイザーで日本語の部分一致検索に対応
CREATE VIRTUAL TABLE search_index USING fts5(
  file_id,
  content,                   -- 全文検索インデックス（privateファイルは登録しない）
  tokenize='trigram'
);
```

## DBの配置とマイグレーション
- DB は `~/Library/Application Support/club.image.sate/sate.db`（OS の AppConfig 直下）に置く。
  vault の外なので iCloud / Obsidian の同期対象に入らない。
- 旧バージョンは `{vault}/.sate/sate.db` に置いていたため、旧 DB があれば一度だけ
  AppConfig に複製（WAL/SHM 込み）して旧ディレクトリを削除する（`migrateLegacyDatabase`）。
- `files.private` カラムは存在しなければ `ALTER TABLE` で追加する軽量マイグレーションあり。
- FTS テーブルが古いトークナイザーで作られていれば作り直す。

## Reconcile（ファイルシステム ↔ DB 同期）
- 起動時に vault フォルダをスキャンし、DB と突き合わせる（`src/lib/reconcile.ts`）。
- フロントマターの無い `.md` には UUID と作成/更新日時を注入（Obsidian 等で作られたファイルを追跡）。
- DB にあって実ファイルが消えているレコードは `detachFile` で一覧から外す（スナップショット履歴は残す）。
- これにより「`.md` が唯一の真実」を担保し、DB はいつでも再生成できる。

ファイル一覧の表示：
```
┌────────────────────────────────────┐
│ 今日の日記                          │  ← titleがあればそちら
│ 本文の書き出しがここに…             │  ← first_line
├────────────────────────────────────┤
│ 2025-03-29-003                     │  ← titleがなければファイル名
│ 本文の書き出しがここに…             │
└────────────────────────────────────┘
```

## スナップショットのタイミング
- 通常の自動保存（タイピング停止 1.5秒後）と同じタイミングで記録
- ファイルを閉じる / 切り替える時にも保存される
- 直前のスナップショットと同一内容の場合はスキップ（`addSnapshot` 内で重複チェック）
- スナップショットの `content` にはフロントマター込みの全文を保存する

## タイムマシンUI（Rewind方式）

実装は `src/App.tsx`（状態管理・キーバインド）と `src/components/RewindOverlay.tsx`（UI）。
**`Shift+Cmd+スクロール`** で起動し、そのまま遡る/進む。

```
通常モード
  ↓ Shift+Cmd+スクロール（最初の操作で起動）
タイムラインモード（画面下部にスクラバー出現）
  ↓ Shift+Cmd+スクロール（上=過去 / 下=未来） または ← / →
過去のスナップショットを遡る/進む（テキストがリアルタイムに変化、前との差分を色分け表示）
  ↓ Enter
その時点に復元（復元前の状態もスナップショットとして保存）
  ↓ Esc
現在に戻る（何もしない）
```

- `Cmd` 単独ではなく `Shift+Cmd` を要求する。トラックパッドの慣性スクロール中に Cmd を
  押し下げた瞬間の誤発動を避けるため。
- スクロール量 50px（`SCROLL_STEP_THRESHOLD`）ごとに 1 スナップショット移動。
- Rewind 中は通常のキー入力を横取りし、編集が混入しないようにする。
- ファイルが切り替わったら（新規含め）Rewind は強制終了。
- 直前のスナップショットとの差分（追加/削除された行）を色分けし、変化のあった行を画面中央へ自動スクロール。

スクラバーのイメージ：
```
14:23 ●───────────────────────── 14:45（現在）
       ↑ スクロールで移動
```
