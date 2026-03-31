import { useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark, codeBlockKeymap, hardbreakSchema } from '@milkdown/preset-commonmark';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/react';
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

interface EditorComponentProps {
  onChange: (markdown: string) => void;
}

// Enter を hard break (Shift+Enter相当) にする
const enterAsHardBreakPlugin = $prose((ctx) => {
  const hardbreakType = hardbreakSchema.type(ctx);
  return new Plugin({
    key: new PluginKey('enter-as-hardbreak'),
    props: {
      handleKeyDown(view, event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const { tr } = view.state;
          view.dispatch(tr.replaceSelectionWith(hardbreakType.create()).scrollIntoView());
          return true;
        }
        return false;
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
          Decoration.inline(from, to, { class: 'sate-selection' }),
        ]);
      },
    },
  });
});

function MilkdownEditor({ onChange }: EditorComponentProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, '');
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(listener)
      .use(enterAsHardBreakPlugin)
      .use(selectionHighlightPlugin)
      .config((ctx) => {
        ctx.set(codeBlockKeymap.key, {
          CreateCodeBlock: { shortcuts: '' },
        });
      }),
    []
  );

  return <Milkdown />;
}

export default function EditorComponent({ onChange }: EditorComponentProps) {
  return (
    <MilkdownProvider>
      <ProsemirrorAdapterProvider>
        <MilkdownEditor onChange={onChange} />
      </ProsemirrorAdapterProvider>
    </MilkdownProvider>
  );
}
