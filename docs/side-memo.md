# サイドメモ機能

本文の脇に、思いついた言葉や気づきをちょっと書いておくための付箋。
本文の流れを止めずに断片を残せる。

---

## 操作

| 操作 | やり方 |
|---|---|
| 作成 | 左右の余白をダブルクリック。クリック位置のテキスト付近に配置される |
| 編集 | そのまま書く。小さい文字（12px）で表示される |
| 移動 | メモ上辺のドラッグハンドル（ホバーで出現）を上下にドラッグ |
| 削除 | ホバー時の×ボタン。空メモはフォーカスが外れた時点で自動削除 |
| フォーカス戻し | Escape で本文エディタにフォーカスが戻る |

---

## 表示

- 横幅は固定（160px）、高さはテキスト量に応じて自動伸縮
- フォントは本文と同じ游ゴシック系、12px
- ボーダーは通常透明、ホバーで薄く、フォーカスでアクセントカラー
- 初回表示時は位置確定後にフェードインする

---

## 位置追跡のアーキテクチャ

メモはドキュメント内の「相対位置」で本文に紐づく。段落単位ではなく、ドキュメント全体の中での位置比率（0〜1）を保持する。

### 保存データ

frontmatter に埋め込む:

```yaml
memos:
  - id: a1b2c3d4
    side: right
    relativePos: 0.35
    content: "この話もう少し膨らませたい"
```

| フィールド | 説明 |
|---|---|
| `id` | メモの一意ID（UUID先頭8文字） |
| `side` | `left` または `right`。どちらの余白に置くか |
| `relativePos` | ドキュメント内の相対位置（0〜1）。`doc.content.size` に対する比率 |
| `content` | メモの本文 |

### ランタイムの位置管理

ProseMirror プラグイン (`memoDecorationPlugin.ts`) がメモの位置を管理する。

1. **ファイル読込時**: `relativePos` → `Math.round(doc.content.size * relativePos)` でドキュメント内の絶対位置 (pos) に変換
2. **テキスト編集時**: `tr.mapping.map(pos)` で ProseMirror の Mapping が自動追跡。段落解決やテキストマッチは不要
3. **ドラッグ移動時**: `view.posAtCoords()` でドロップ先の pos を取得し、プラグインに meta dispatch で即時反映
4. **表示位置の計算**: プラグインの `view.update` コールバックで `coordsAtPos(pos)` → ピクセル座標を取得し、`style.top` を直接設定
5. **保存時同期**: 500ms タイマーでプラグインの pos → `relativePos` に変換して React state に書き戻し

### React に頼らない位置更新

位置の計算と DOM 操作は ProseMirror プラグインが直接行い、React のレンダーサイクルを経由しない。これにより段落のリフロー（改行発生）とメモの位置更新が同一フレームで完結し、ラグが発生しない。

```
テキスト編集 → tr.mapping.map(pos) → view.update → coordsAtPos → style.top 直接設定
```

React が担当するのはメモカードの描画（textarea、ボタン等）とメモ内容の状態管理のみ。

---

## 保存

- `.md` ファイルのフロントマターに埋め込む（単一ファイル完結の原則を維持）
- 本文と同じ自動保存（1.5秒 debounce）に載せる
- メモの作成・編集・移動・削除いずれもオートセーブ対象

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/components/memoDecorationPlugin.ts` | ProseMirror プラグイン（位置追跡・DOM 位置同期） |
| `src/components/SideMemoLayer.tsx` | メモレイヤー（カード描画・作成・編集・削除・ドラッグ） |
| `src/components/SideMemoLayer.css` | スタイル |
| `src/lib/frontmatter.ts` | `Memo` 型定義、frontmatter のビルド/パース |
| `src/hooks/useFile.ts` | `memos` 状態管理、`updateMemos` コールバック |
| `src/components/Editor.tsx` | Milkdown エディタ設定、MemoSync（追加/削除通知・定期同期） |
