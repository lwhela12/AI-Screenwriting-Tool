import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment, Extension } from '@codemirror/state';
import { EditorView, keymap, Decoration, ViewUpdate } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { basicSetup } from '@codemirror/basic-setup';
import './Editor.css';

interface EditorProps {
  initialText?: string;
}

const themeCompartment = new Compartment();
const typewriterCompartment = new Compartment();

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#1e1e1e', color: '#f7f7f7', height: '100%' },
    '.cm-content': { caretColor: '#ffffff' },
  },
  { dark: true },
);

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff', color: '#000000', height: '100%' },
});

const typewriterTheme = EditorView.theme({
  '.cm-content': {
    maxWidth: '700px',
    margin: '0 auto',
    paddingTop: '40vh',
    paddingBottom: '40vh',
  },
});

function scriptFormatting(
  characters: Set<string>,
  locations: Set<string>,
): Extension {
  return EditorView.decorations.compute([EditorState.doc], (state) => {
    const widgets: any[] = [];
    for (let pos = 0; pos < state.doc.length; ) {
      const line = state.doc.lineAt(pos);
      const text = line.text.trim();
      if (/^(INT|EXT)/i.test(text)) {
        widgets.push(Decoration.line({ class: 'scene-heading' }).range(line.from));
        const loc = text.replace(/^(INT|EXT)\.*/i, '').trim();
        if (loc) locations.add(loc.toUpperCase());
      } else if (/^[A-Z0-9 ]{2,30}$/.test(text) && text === text.toUpperCase()) {
        widgets.push(Decoration.line({ class: 'character-name' }).range(line.from));
        characters.add(text);
      }
      pos = line.to + 1;
    }
    return Decoration.set(widgets);
  });
}

function scriptCompletion(characters: Set<string>, locations: Set<string>): Extension {
  return autocompletion({
    override: [
      (ctx: CompletionContext) => {
        const token = ctx.matchBefore(/\w+/);
        if (!token || (token.from == token.to && !ctx.explicit)) return null;
        const word = token.text.toUpperCase();
        const options: { label: string }[] = [];
        characters.forEach((name) => {
          if (name.startsWith(word)) options.push({ label: name });
        });
        locations.forEach((loc) => {
          if (loc.startsWith(word)) options.push({ label: loc });
        });
        if (options.length === 0) return null;
        return {
          from: token.from,
          options,
        };
      },
    ],
  });
}

export const Editor: React.FC<EditorProps> = ({ initialText = '' }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const [dark, setDark] = useState(false);
  const [typewriter, setTypewriter] = useState(false);

  const characters = useRef<Set<string>>(new Set());
  const locations = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!editorRef.current) return;
    const startState = EditorState.create({
      doc: initialText,
      extensions: [
        basicSetup,
        keymap.of(defaultKeymap),
        scriptFormatting(characters.current, locations.current),
        scriptCompletion(characters.current, locations.current),
        themeCompartment.of(lightTheme),
        typewriterCompartment.of([]),
      ],
    });
    const view = new EditorView({ state: startState, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
  }, [initialText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(dark ? darkTheme : lightTheme) });
  }, [dark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: typewriterCompartment.reconfigure(typewriter ? typewriterTheme : []) });
  }, [typewriter]);

  return (
    <div className="editor-wrapper">
      <div className="toolbar">
        <button onClick={() => setDark((d) => !d)}>{dark ? 'Light' : 'Dark'} Mode</button>
        <button onClick={() => setTypewriter((t) => !t)}>{typewriter ? 'Normal' : 'Typewriter'}</button>
        <button disabled>Notes</button>
      </div>
      <div ref={editorRef} className="editor" />
    </div>
  );
};

export default Editor;
