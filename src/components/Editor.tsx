import { useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark, codeBlockKeymap, hardbreakSchema } from '@milkdown/preset-commonmark';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/react';
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
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
          Decoration.inline(from, to, {
            class: 'sate-selection',
            style: 'background-color: #555048;',
          }),
        ]);
      },
    },
  });
});

// Ctrl+A/E を hardbreak 境界での行頭・行末移動にする
const lineNavPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('line-navigation'),
    props: {
      handleKeyDown(view, event) {
        if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;

        if (event.key === 'a') {
          event.preventDefault();
          const { state } = view;
          const { $head } = state.selection;
          const parent = $head.parent;
          const startOfBlock = $head.start();
          const posInParent = $head.pos - startOfBlock;

          let lineStart = 0;
          let offset = 0;
          for (let i = 0; i < parent.childCount; i++) {
            const child = parent.child(i);
            if (offset >= posInParent) break;
            if (child.type.name === 'hardbreak') {
              lineStart = offset + child.nodeSize;
            }
            offset += child.nodeSize;
          }

          view.dispatch(
            state.tr.setSelection(TextSelection.create(state.doc, startOfBlock + lineStart))
          );
          return true;
        }

        if (event.key === 'e') {
          event.preventDefault();
          const { state } = view;
          const { $head } = state.selection;
          const parent = $head.parent;
          const startOfBlock = $head.start();
          const posInParent = $head.pos - startOfBlock;

          let lineEnd = parent.content.size;
          let offset = 0;
          for (let i = 0; i < parent.childCount; i++) {
            const child = parent.child(i);
            if (child.type.name === 'hardbreak' && offset >= posInParent) {
              lineEnd = offset;
              break;
            }
            offset += child.nodeSize;
          }

          view.dispatch(
            state.tr.setSelection(TextSelection.create(state.doc, startOfBlock + lineEnd))
          );
          return true;
        }

        return false;
      },
    },
  });
});

// カスタムカーソル（line-heightに依存しない高さ）
// IME変換中はwidgetを挿入しない（DOM操作で変換が途切れるため）
const customCaretPlugin = $prose(() => {
  let composing = false;
  return new Plugin({
    key: new PluginKey('custom-caret'),
    props: {
      handleDOMEvents: {
        compositionstart: (_view) => {
          composing = true;
          _view.dom.classList.add('ime-active');
          return false;
        },
        compositionend: (_view) => {
          composing = false;
          _view.dom.classList.remove('ime-active');
          setTimeout(() => _view.dispatch(_view.state.tr), 0);
          return false;
        },
      },
      decorations(state) {
        if (composing) return DecorationSet.empty;
        const { selection } = state;
        if (!selection.empty) return DecorationSet.empty;
        const widget = Decoration.widget(
          selection.head,
          () => {
            const el = document.createElement('span');
            el.className = 'sate-caret';
            return el;
          },
          { side: -1, key: 'sate-caret' }
        );
        return DecorationSet.create(state.doc, [widget]);
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
      .use(lineNavPlugin)
      .use(selectionHighlightPlugin)
      .use(customCaretPlugin)
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
