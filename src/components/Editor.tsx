import { useCallback, useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditor, Milkdown, MilkdownProvider } from '@milkdown/react';
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/react';

interface EditorComponentProps {
  onChange: (markdown: string) => void;
}

function MilkdownEditor({ onChange }: EditorComponentProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const { get } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, '');
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(listener),
    []
  );

  // Trigger editor creation
  const editorRef = useCallback(() => {
    get();
  }, [get]);

  void editorRef;

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
