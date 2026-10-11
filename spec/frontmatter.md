# フロントマター

ファイルの同一性管理と将来の拡張のため、フロントマターを使用する。**Milkdown上では非表示**にする。
実装は `src/lib/frontmatter.ts`（`parseFrontMatter` / `buildFrontMatter`）。YAML パースには `yaml` パッケージを使用。

```yaml
---
uuid: 550e8400-e29b-41d4-a716-446655440000   # UUID（不変）
created: 2025-03-30T14:23:10                  # ISO8601
updated: 2025-03-30T15:01:22                  # ISO8601。保存のたびに更新
title: 今日の日記                              # 任意。なければ出力しない（ファイル名で代替）
private: true                                 # 任意。プライベート指定（private.md 参照）。false のときは出力しない
memos:                                        # 任意。サイドメモ（side-memo.md 参照）。空のときは出力しない
  - id: a1b2c3d4
    side: left                                # left | right
    relativePos: 0.35                         # ドキュメント内の相対位置（0〜1）
    content: メモ内容
---
```

> **未実装フィールド**: `font`（游ゴシック/游明朝）、`theme`（dark/light）は現時点では未実装。
> 現状テーマはダーク固定、フォントは游ゴシック固定で、これらをフロントマターに書き出す処理は無い。

## ファイル同一性の解決ロジック

ファイルを開く際、フロントマターの`uuid`で照合する。

```
1. frontmatterのuuidで探す → 見つかればOK
2. 見つからない             → 新規ファイルとして扱う
```

リネーム・移動・iCloud同期のいずれの場合もUUIDは不変なので、すべてのケースをカバーできる。
フロントマターが無い `.md`（Obsidian 等で作られたファイル）は、起動時の Reconcile（[snapshots.md](snapshots.md) の「Reconcile」参照）で自動的に
UUID と作成/更新日時（ファイルシステムの birthtime / mtime）を注入する。
