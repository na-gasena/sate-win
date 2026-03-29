import { useEffect } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { useEditor, Milkdown } from '@milkdown/react';
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/react';

interface EditorComponentProps {
  defaultValue: string;
  onChange: (markdown: string) => void;
}

function MilkdownEditor({ defaultValue, onChange }: EditorComponentProps) {
  const { get } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValue);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChange(markdown);
        });
      })
      .use(commonmark)
      .use(listener)
  );

  // Keep reference for potential future use
  useEffect(() => {
    get();
  }, [get]);

  return <Milkdown />;
}

export default function EditorComponent({ defaultValue, onChange }: EditorComponentProps) {
  return (
    <ProsemirrorAdapterProvider>
      <MilkdownEditor defaultValue={defaultValue} onChange={onChange} />
    </ProsemirrorAdapterProvider>
  );
}
