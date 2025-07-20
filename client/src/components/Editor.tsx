import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Extension, Compartment, StateField, StateEffect } from '@codemirror/state';
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
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType
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
import './EditorPage.css';
import './ScreenplayFormat.css';
import { screenplayFormatting, screenplayKeymap } from './screenplay/ScreenplayFormatter';
import { pageBreakHandling } from './screenplay/PageBreakHandler';
import { specializedElements } from './screenplay/SpecializedElements';
import { actionFormatterPlugin } from './screenplay/ActionFormatter';
import { TitlePage } from './TitlePage';

interface EditorProps {
  initialText?: string;
  onContentChange?: (content: string) => void;
  projectTitle?: string;
  projectAuthor?: string;
  projectContact?: string;
  onTitlePageUpdate?: (data: { title: string; author?: string; contact?: string }) => void;
}

// Constants for screenplay formatting
const LINES_PER_PAGE = 55; // Standard screenplay lines per page
const CHAR_PER_LINE = 61; // Standard screenplay characters per line

// Page number widget
class PageNumberWidget extends WidgetType {
  constructor(readonly pageNum: number) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-page-number';
    span.textContent = `${this.pageNum}.`;
    return span;
  }
}

// Page break widget
class PageBreakWidget extends WidgetType {
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-page-break';
    return div;
  }
}

// Page view plugin
const pageViewPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  
  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }
  
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  
  buildDecorations(view: EditorView) {
    const widgets: any[] = [];
    const doc = view.state.doc;
    const pageHeight = LINES_PER_PAGE;
    let currentPage = 1;
    let linesInPage = 0;
    
    // Add page container class
    view.dom.classList.add('cm-pages-container');
    
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      linesInPage++;
      
      // Add page break and number when reaching page limit
      if (linesInPage >= pageHeight && i < doc.lines) {
        // Add page break after this line
        widgets.push(
          Decoration.widget({
            widget: new PageBreakWidget(),
            side: 1
          }).range(line.to)
        );
        
        currentPage++;
        linesInPage = 0;
        
        // Add page number at the start of the next page (only if page 2 or higher)
        if (i < doc.lines && currentPage > 1) {
          const nextLine = doc.line(i + 1);
          widgets.push(
            Decoration.widget({
              widget: new PageNumberWidget(currentPage),
              side: -1
            }).range(nextLine.from)
          );
        }
      }
    }
    
    return Decoration.set(widgets);
  }
}, {
  decorations: v => v.decorations
});

// Create a minimal basicSetup that includes essential features
function createBasicSetup(): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    rectangularSelection(),
    keymap.of([
      ...screenplayKeymap, // Screenplay shortcuts take precedence
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap
    ])
  ];
}

// Enhanced themes with page support
const createDarkTheme = () => EditorView.theme({
  '&': { 
    backgroundColor: '#000000', // Black page
    height: '100%',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8), 0 2px 8px rgba(0, 0, 0, 0.6)',
    borderRadius: '4px',
    color: '#ffffff' // White text
  },
  '.cm-content': { 
    caretColor: '#ffffff',
    padding: '1in 1in 1in 1.5in',
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '12pt',
    lineHeight: '12pt',
    minHeight: '9in', // 11in - 2in margins
    backgroundColor: '#000000', // Black page
    color: '#ffffff' // White text
  },
  '.cm-page': {
    backgroundColor: '#000000', // Black page
    color: '#ffffff' // White text
  },
  '.cm-gutters': {
    display: 'none' // Hide gutters for screenplay format
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)'
  },
  '.cm-scroller': {
    backgroundColor: '#000000', // Black page
    color: '#ffffff' // White text
  },
  '.cm-cursor': {
    borderLeftColor: '#ffffff'
  }
}, { dark: true });

const createLightTheme = () => EditorView.theme({
  '&': { 
    backgroundColor: '#ffffff',
    height: '100%',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
    borderRadius: '4px'
  },
  '.cm-content': { 
    caretColor: '#000000',
    padding: '1in 1in 1in 1.5in',
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '12pt',
    lineHeight: '12pt',
    minHeight: '9in', // 11in - 2in margins
    backgroundColor: '#ffffff'
  },
  '.cm-page': {
    backgroundColor: '#ffffff',
    color: '#000000'
  },
  '.cm-gutters': {
    display: 'none' // Hide gutters for screenplay format
  },
  '.cm-scroller': {
    backgroundColor: '#ffffff'
  }
});

const createTypewriterTheme = () => [
  EditorView.theme({
    '.cm-content': {
      paddingTop: '40vh',
      paddingBottom: '40vh',
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

// Enhanced script formatting for screenplay elements
function createScriptFormatting(): Extension {
  return EditorView.decorations.compute(['doc'], state => {
    const decorations: any[] = [];
    const doc = state.doc;
    
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text.trim();
      const prevLine = i > 1 ? doc.line(i - 1).text.trim() : '';
      const nextLine = i < doc.lines ? doc.line(i + 1).text.trim() : '';
      
      // Scene headings
      if (/^(INT|EXT|EST)[\.\s]/i.test(text)) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-scene-heading' 
          }).range(line.from)
        );
      }
      // Character names (all caps, potentially with parenthetical)
      else if (/^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(text) && text === text.toUpperCase()) {
        // Only mark as character if next line exists and isn't empty
        if (nextLine) {
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
      // Dialogue (follows character name or parenthetical)
      else if (prevLine && (
        /^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(prevLine) || 
        /^\([^)]+\)$/.test(prevLine)
      )) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-dialogue' 
          }).range(line.from)
        );
      }
      // Transitions
      else if (/^(FADE IN:|FADE OUT\.|FADE TO:|CUT TO:|DISSOLVE TO:|SMASH CUT:|MATCH CUT:)$/i.test(text)) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-transition' 
          }).range(line.from)
        );
      }
      // Action lines (default)
      else if (text.length > 0) {
        decorations.push(
          Decoration.line({ 
            class: 'cm-action' 
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

// Page status display
function getPageStatus(view: EditorView): string {
  const doc = view.state.doc;
  const totalLines = doc.lines;
  const currentPage = Math.ceil(totalLines / LINES_PER_PAGE) || 1;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;
  const cursorPage = Math.ceil(cursorLine / LINES_PER_PAGE);
  
  return `Page ${cursorPage} of ${currentPage}`;
}

export const Editor: React.FC<EditorProps> = ({ 
  initialText = '', 
  onContentChange,
  projectTitle = 'Untitled',
  projectAuthor,
  projectContact,
  onTitlePageUpdate
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [dark, setDark] = useState(false);
  const [typewriter, setTypewriter] = useState(false);
  const [pageStatus, setPageStatus] = useState('Page 1 of 1');
  const [showTitlePage, setShowTitlePage] = useState(false);
  
  // Create compartments inside component to avoid scope issues
  const themeCompartment = useRef(new Compartment());
  const typewriterCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!editorRef.current) return;
    
    // If we already have an editor and text changed, update it
    if (viewRef.current && initialText !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: initialText
        }
      });
      return;
    }
    
    // Create new editor if we don't have one
    if (viewRef.current) return;
    
    const startState = EditorState.create({
      doc: initialText || '',
      extensions: [
        ...createBasicSetup(),
        EditorView.lineWrapping,
        screenplayFormatting(), // Add screenplay auto-formatting
        pageBreakHandling(), // Add (MORE) and (CONT'D) handling
        specializedElements(), // Add specialized screenplay elements
        actionFormatterPlugin, // Add action line auto-formatting
        // createScriptFormatting(), // Disabled - using screenplayFormatting instead
        // createScriptCompletion(), // Disabled - removing intrusive dropdowns
        pageViewPlugin,
        themeCompartment.current.of(createLightTheme()),
        typewriterCompartment.current.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) {
            setPageStatus(getPageStatus(update.view));
            if (update.docChanged && onContentChange) {
              onContentChange(update.state.doc.toString());
            }
          }
        })
      ]
    });
    
    const view = new EditorView({ 
      state: startState, 
      parent: editorRef.current 
    });
    
    viewRef.current = view;
    setPageStatus(getPageStatus(view));
    
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [initialText]); // Re-add dependency to handle project changes

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
    <div className={`editor-wrapper ${dark ? 'dark' : ''}`}>
      <div className="toolbar">
        <button onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'} Mode
        </button>
        <button onClick={() => setTypewriter(t => !t)}>
          {typewriter ? 'Normal' : 'Typewriter'} View
        </button>
        <button onClick={() => setShowTitlePage(true)}>Title Page</button>
        <button disabled>Notes</button>
        <span className="toolbar-info">
          {pageStatus} • Screenplay Format
        </span>
      </div>
      <div ref={editorRef} className="editor" />
      
      {showTitlePage && (
        <TitlePage
          title={projectTitle}
          author={projectAuthor}
          contact={projectContact}
          onUpdate={onTitlePageUpdate}
          onClose={() => setShowTitlePage(false)}
        />
      )}
    </div>
  );
};

export default Editor;