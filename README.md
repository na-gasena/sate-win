# Sate

「書くこと」に特化したmacOS向けテキストエディタ。

- 仕様: `SATE_SPEC.md`
- 開発ガイド: `CLAUDE.md`

## 開発

```bash
npm run dev        # Vite dev server (localhost:5173)
npm run tauri dev  # Tauriアプリとして起動（開発モード）
npx tsc --noEmit   # 型チェックのみ
npm run lint       # ESLint
```

## ビルド

```bash
# 普段使い用（/Applications からショートカットを張っている方）
# 成果物: src-tauri/target/debug/bundle/macos/Sate.app
npm run tauri build -- --debug

# プロダクションビルド
# 成果物: src-tauri/target/release/bundle/macos/Sate.app
npm run tauri build
```

> [!NOTE]
> `/Applications` のショートカットは **debug** 側の `Sate.app` を指している。
> アプリ本体を更新したいときは `--debug` 付きでビルドすること。
