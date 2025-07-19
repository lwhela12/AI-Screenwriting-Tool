import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Extension, Compartment } from '@codemirror/state';
import { 
  EditorView, 
  keymap, 
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  lineNumbers,
  highlightActiveLineGutter,
  Decoration,
  ViewUpdate
} from '@codemirror/view';
import { 
  defaultKeymap, 
  history, 
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import { 
  autocompletion, 
  completionKeymap,
  CompletionContext
} from '@codemirror/autocomplete';
import { searchKeymap } from '@codemirror/search';
import { 
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle
} from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import './Editor.css';

interface EditorProps {
  initialText?: string;
}

// Create a minimal basicSetup that includes essential features
function createBasicSetup(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    rectangularSelection(),
    keymap.of([
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab
    ])
  ];
}

// Themes
const createDarkTheme = () => EditorView.theme({
  '&': { 
    backgroundColor: '#1e1e1e', 
    color: '#f7f7f7', 
    height: '100%' 
  },
  '.cm-content': { 
    caretColor: '#ffffff' 
  },
  '.cm-gutters': {
    backgroundColor: '#252525',
    color: '#858585',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#323232'
  },
  '.cm-activeLine': {
    backgroundColor: '#2a2a2a'
  }
}, { dark: true });

const createLightTheme = () => EditorView.theme({
  '&': { 
    backgroundColor: '#ffffff', 
    color: '#000000', 
    height: '100%' 
  },
  '.cm-content': { 
    caretColor: '#000000' 
  },
  '.cm-gutters': {
    backgroundColor: '#f7f7f7',
    color: '#999',
    border: 'none'
  }
});

const createTypewriterTheme = () => [
  EditorView.theme({
    '.cm-content': {
      maxWidth: '700px',
      margin: '0 auto',
      paddingTop: '40vh',
      paddingBottom: '40vh',
    },
    '.cm-line': {
      paddingLeft: '2em',
      paddingRight: '2em'
    },
    '.cm-scroller': {
      fontFamily: 'Courier New, monospace',
      fontSize: '14pt',
      lineHeight: '2'
    }
  }),
  EditorView.updateListener.of((update) => {
    if (update.docChanged || update.selectionSet) {
      const view = update.view;
      const head = view.state.selection.main.head;
      const pos = view.coordsAtPos(head);
      if (pos) {
        const scroller = view.scrollDOM;
        const scrollerRect = scroller.getBoundingClientRect();
        const targetY = scrollerRect.height / 2;
        const currentY = pos.top - scrollerRect.top;
        const scrollTop = scroller.scrollTop + (currentY - targetY);
        
        scroller.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
      }
    }
  })
];

// Script formatting for screenplay elements
function createScriptFormatting(): Extension {
  return EditorView.decorations.compute(['doc'], state => {
    const decorations: any[] = [];
    const doc = state.doc;
    
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text.trim();
      
      // Scene headings
      if (/^(INT|EXT|EST)[\.\s]/i.test(text)) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-scene-heading' 
          }).range(line.from)
        );
      }
      // Character names (all caps, potentially with parenthetical)
      else if (/^[A-Z][A-Z0-9\s]{1,30}(\s*\([^)]+\))?$/.test(text) && text === text.toUpperCase()) {
        const nextLine = i < doc.lines ? doc.line(i + 1) : null;
        // Only mark as character if next line exists and isn't empty
        if (nextLine && nextLine.text.trim()) {
          decorations.push(
            Decoration.line({ 
              class: 'cm-character-name' 
            }).range(line.from)
          );
        }
      }
      // Parentheticals
      else if (/^\([^)]+\)$/.test(text)) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-parenthetical' 
          }).range(line.from)
        );
      }
      // Transitions
      else if (/^(FADE IN:|FADE OUT\.|FADE TO:|CUT TO:|DISSOLVE TO:)$/i.test(text)) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-transition' 
          }).range(line.from)
        );
      }
    }
    
    return Decoration.set(decorations);
  });
}

// Autocompletion for screenplay elements
function createScriptCompletion(): Extension {
  const characters = new Set<string>();
  const locations = new Set<string>();
  
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        const before = context.matchBefore(/\w*/);
        if (!before) return null;
        
        // Update our sets based on document content
        const doc = context.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const text = line.text.trim();
          
          if (/^(INT|EXT|EST)[\.\s]/i.test(text)) {
            const location = text.replace(/^(INT|EXT|EST)[\.\s]*/i, '').trim();
            if (location) locations.add(location);
          } else if (/^[A-Z][A-Z0-9\s]{1,30}$/.test(text) && text === text.toUpperCase()) {
            characters.add(text);
          }
        }
        
        // Provide completions
        const options = [];
        const word = before.text.toUpperCase();
        
        // Scene heading completions
        if (word.startsWith('INT') || word.startsWith('EXT') || word.startsWith('EST')) {
          options.push(
            { label: 'INT. ', apply: 'INT. ', detail: 'Interior' },
            { label: 'EXT. ', apply: 'EXT. ', detail: 'Exterior' },
            { label: 'EST. ', apply: 'EST. ', detail: 'Establishing' }
          );
        }
        
        // Character completions
        for (const char of characters) {
          if (char.startsWith(word)) {
            options.push({ 
              label: char, 
              apply: char + '\n', 
              detail: 'Character' 
            });
          }
        }
        
        // Location completions
        for (const loc of locations) {
          if (loc.toUpperCase().includes(word)) {
            options.push({ 
              label: loc, 
              apply: loc, 
              detail: 'Location' 
            });
          }
        }
        
        // Transition completions
        const transitions = ['FADE IN:', 'FADE OUT.', 'FADE TO:', 'CUT TO:', 'DISSOLVE TO:'];
        for (const trans of transitions) {
          if (trans.startsWith(word)) {
            options.push({ 
              label: trans, 
              apply: trans, 
              detail: 'Transition' 
            });
          }
        }
        
        return options.length > 0 ? {
          from: before.from,
          options
        } : null;
      }
    ]
  });
}

export const Editor: React.FC<EditorProps> = ({ initialText = '' }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [dark, setDark] = useState(false);
  const [typewriter, setTypewriter] = useState(false);
  
  // Create compartments inside component to avoid scope issues
  const themeCompartment = useRef(new Compartment());
  const typewriterCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;
    
    const startState = EditorState.create({
      doc: initialText,
      extensions: [
        ...createBasicSetup(),
        EditorView.lineWrapping,
        createScriptFormatting(),
        createScriptCompletion(),
        themeCompartment.current.of(createLightTheme()),
        typewriterCompartment.current.of([])
      ]
    });
    
    const view = new EditorView({ 
      state: startState, 
      parent: editorRef.current 
    });
    
    viewRef.current = view;
    
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []); // Remove initialText dependency to prevent recreation

  // Handle theme changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: themeCompartment.current.reconfigure(
          dark ? createDarkTheme() : createLightTheme()
        )
      });
    }
  }, [dark]);

  // Handle typewriter mode changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: typewriterCompartment.current.reconfigure(
          typewriter ? createTypewriterTheme() : []
        )
      });
      
      // If enabling typewriter mode, focus the editor
      if (typewriter) {
        viewRef.current.focus();
      }
    }
  }, [typewriter]);

  return (
    <div className="editor-wrapper">
      <div className="toolbar">
        <button onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'} Mode
        </button>
        <button onClick={() => setTypewriter(t => !t)}>
          {typewriter ? 'Normal' : 'Typewriter'} View
        </button>
        <button disabled>Notes</button>
        <span className="toolbar-info">
          Screenplay Editor - Auto-formats as you type
        </span>
      </div>
      <div ref={editorRef} className="editor" />
    </div>
  );
};

export default Editor;