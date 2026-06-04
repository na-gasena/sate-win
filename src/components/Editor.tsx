import { useRef, useEffect } from 'react';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
import { commonmark, codeBlockKeymap } from '@milkdown/preset-commonmark';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditor, Milkdown, MilkdownProvider, useInstance } from '@milkdown/react';
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/react';
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { splitBlock } from '@milkdown/prose/commands';
import type { Memo } from '../lib/frontmatter';
import { createMemoPlugin, memoPluginKey, getPositions, syncPositionsToMemos } from './memoDecorationPlugin';

interface EditorComponentProps {
  onChange: (markdown: string) => void;
  initialContent?: string;
  memosRef: React.RefObject<Memo[]>;
  memos: Memo[];
  onMemosChange: (memos: Memo[]) => void;
  editorViewRef: React.MutableRefObject<import('@milkdown/prose/view').EditorView | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

// Shift+Enter を通常のEnter（段落分割）と同じにする
const shiftEnterAsSplitPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('shift-enter-as-split'),
    props: {
      handleKeyDown(view, event) {
        if (event.key === 'Enter' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          return splitBlock(view.state, view.dispatch);
        }
        return false;
      },
    },
  });
});

// コピー時のプレーンテキストを段落ごとに改行1つで区切る（デフォルトは\n\n）
const clipboardTextSerializerPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('clipboard-text-serializer'),
    props: {
      clipboardTextSerializer(slice) {
        return slice.content.textBetween(0, slice.content.size, '\n');
      },
    },
  });
});

// テキスト選択のハイライトをカスタムデコレーションで描画
const selectionHighlightPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('selection-highlight'),
    props: {
      decorations(state) {
        const { from, to } = state.selection;
        if (from === to) return DecorationSet.empty;
        return DecorationSet.create(state.doc, [
          Decoration.inline(from, to, {
            class: 'sate-selection',
            style: 'background-color: #555048;',
          }),
        ]);
      },
    },
  });
});

function MilkdownEditor({ onChange, initialContent = '', memosRef, editorViewRef, containerRef }: Omit<EditorComponentProps, 'memos' | 'onMemosChange'>) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // メモ位置追跡プラグイン（Widget Decoration なし）
  const memoPlugin = useRef(
    $prose(() => createMemoPlugin(memosRef, containerRef)),
  ).current;

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContent);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(history)
      .use(listener)
      .use(shiftEnterAsSplitPlugin)
      .use(selectionHighlightPlugin)
      .use(clipboardTextSerializerPlugin)
      .use(memoPlugin)
      .config((ctx) => {
        ctx.set(codeBlockKeymap.key, {
          CreateCodeBlock: { shortcuts: '' },
        });
      }),
    []
  );

  // EditorView の参照を親に公開
  const [loading, getInstance] = useInstance();
  const didInitialFocusRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    const editor = getInstance();
    if (!editor) return;
    try {
      const view = editor.ctx.get(editorViewCtx);
      editorViewRef.current = view;
      if (!didInitialFocusRef.current && view && !view.isDestroyed) {
        didInitialFocusRef.current = true;
        view.focus();
      }
    } catch { /* not ready */ }
  }, [loading, getInstance, editorViewRef]);

  return <Milkdown />;
}

/**
 * メモ構造変化(追加/削除)を検知して ProseMirror プラグインに通知する。
 * また、プラグインの位置マップを定期的に React state に書き戻す。
 */
function MemoSync({ memos, onMemosChange }: { memos: Memo[]; onMemosChange: (memos: Memo[]) => void }) {
  const [loading, getInstance] = useInstance();
  const prevIdsRef = useRef('');
  const onMemosChangeRef = useRef(onMemosChange);
  onMemosChangeRef.current = onMemosChange;
  const memosRef = useRef(memos);
  memosRef.current = memos;

  // メモ追加/削除時にプラグインに通知
  useEffect(() => {
    const ids = memos.map((m) => m.id).sort().join(',');
    if (ids === prevIdsRef.current) return;
    prevIdsRef.current = ids;

    if (loading) return;
    const editor = getInstance();
    if (!editor) return;
    queueMicrotask(() => {
      try {
        const view = editor.ctx.get(editorViewCtx);
        if (view && !view.isDestroyed) {
          view.dispatch(view.state.tr.setMeta(memoPluginKey, true));
        }
      } catch { /* not ready */ }
    });
  }, [memos, loading, getInstance]);

  // プラグインの位置マップ → React state への定期同期
  useEffect(() => {
    if (loading) return;
    const editor = getInstance();
    if (!editor) return;

    let lastJson = '';
    const timer = setInterval(() => {
      try {
        const view = editor.ctx.get(editorViewCtx);
        if (!view || view.isDestroyed) return;
        const positions = getPositions(view.state);
        if (!positions) return;
        const json = JSON.stringify([...positions]);
        if (json === lastJson) return;
        lastJson = json;
        const updated = syncPositionsToMemos(view.state.doc, memosRef.current, positions);
        if (updated) onMemosChangeRef.current(updated);
      } catch { /* not ready */ }
    }, 500);

    return () => clearInterval(timer);
  }, [loading, getInstance]);

  return null;
}

export default function EditorComponent({ onChange, initialContent, memosRef, memos, onMemosChange, editorViewRef, containerRef }: EditorComponentProps) {
  return (
    <MilkdownProvider>
      <ProsemirrorAdapterProvider>
        <MilkdownEditor onChange={onChange} initialContent={initialContent} memosRef={memosRef} editorViewRef={editorViewRef} containerRef={containerRef} />
        <MemoSync memos={memos} onMemosChange={onMemosChange} />
      </ProsemirrorAdapterProvider>
    </MilkdownProvider>
  );
}
