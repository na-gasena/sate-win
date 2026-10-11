# サイドメモ

本文の脇に思いついた言葉を置いておける付箋機能。本文の流れを止めずに断片を残せる。
実装は `src/components/SideMemoLayer.tsx`（UI）と `src/components/memoDecorationPlugin.ts`（位置追跡）。

## 操作

| 操作 | やり方 |
|---|---|
| 作成 | 左右の余白をダブルクリック。クリック位置のテキスト付近に配置される |
| 編集 | そのまま書く。小さい文字（12px）で表示される |
| 移動 | メモ上辺のドラッグハンドル（ホバーで出現）を上下にドラッグ |
| 削除 | ホバー時の×ボタン。空メモはフォーカスが外れた時点で自動削除 |
| フォーカス戻し | Escape で本文エディタにフォーカスが戻る |

- 横幅は固定（160px）、高さはテキスト量に応じて自動伸縮
- ボーダーは通常透明、ホバーで薄く、フォーカスでアクセントカラー
- 初回表示時は位置確定後にフェードインする
- ハンドルと×ボタンの表示判定は CSS の `:hover` ではなく、ウインドウ全体の mousemove で
  カードの矩形に入っているかを自前で判定する（`pointer-events: none` のレイヤー上では
  WebKit が離脱イベントを出さず、`:hover` が張り付くため）。入力開始時とドロップ直後にも再判定する

## 保存データ

`.md` のフロントマターに埋め込む（単一ファイル完結の原則を維持）。本文と同じ自動保存に載る。

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

## 位置追跡

段落単位ではなく、ドキュメント全体に対する位置比率で本文に紐づける。

1. **読込時**: `relativePos` → `Math.round(doc.content.size * relativePos)` で絶対 pos に変換
2. **編集時**: `tr.mapping.map(pos)` で ProseMirror の Mapping が自動追跡
3. **ドラッグ移動時**: `view.posAtCoords()` でドロップ先の pos を取得し、プラグインに meta dispatch で即時反映
4. **表示位置**: プラグインの `view.update` で `coordsAtPos(pos)` → `style.top` を直接設定
5. **保存時**: 500ms タイマーで pos → `relativePos` に変換して React state に書き戻す

位置の計算と DOM 操作は ProseMirror プラグインが直接行い、React のレンダーサイクルを経由しない。
段落のリフローとメモの位置更新が同一フレームで完結するのでラグが出ない。React が担当するのは
カードの描画（textarea、ボタン等）とメモ内容の状態管理のみ。
