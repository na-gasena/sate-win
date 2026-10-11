# プライベートファイル

人に見せたくない内容を検索・一覧から隠す指定。実装は `src/components/FileHeader.tsx`（チェックボックス）、
`src/hooks/useFile.ts`（`updatePrivate`）、`src/lib/db.ts`（除外ロジック）。

- ファイルヘッダー右上の "Private" チェックボックスで切り替え
- フロントマターに `private: true` として保存
- ON のとき：
  - 全文検索インデックス（`search_index`）に登録しない → 検索でヒットしない
  - 一覧の本文プレビュー（`first_line`）を NULL にする → ファイルオーバーレイで内容が見えない
  - ファイルオーバーレイでは鍵アイコン付きで表示される
