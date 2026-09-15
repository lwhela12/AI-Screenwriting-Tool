import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { screenplayKeymap } from './plugins/screenplayKeymap';
import { pageViewPlugin, pageStatus } from './plugins/pageView';
import { smartTypePlugin, completionPlugin } from './plugins/smartType';
import { autoFormatPlugin } from './plugins/autoFormat';
import { elementMenuPlugin } from './plugins/elementMenu';
import { clipboardPlugin } from './plugins/clipboard';
import { searchPlugin } from './plugins/search';
import { FindBar } from './FindBar';
import { contentToDoc, docToContent } from './docConverter';
import { ELEMENT_LABELS, isElementType } from './schema/screenplaySchema';
import { TitleSheet, TitlePageData } from './TitleSheet';
import { SceneNavigator } from './SceneNavigator';
import './ProseMirrorEditor.css';

interface ProseMirrorEditorProps {
  /** Stored content for the project; read once when the editor mounts. */
  initialContent?: string;
  /** Called with the serialized document after every change. */
  onContentChange?: (content: string) => void;
  /** Title page fields; when given, the title page is shown above the script. */
  titlePage?: TitlePageData;
  onTitlePageChange?: (data: TitlePageData) => void;
  /** Called once with the live view so other panels (outline, beat board) can act on the script. */
  onReady?: (view: EditorView) => void;
  /** Called after every transaction with the new state. */
  onStateChange?: (state: EditorState) => void;
}

interface Status {
  element: string;
  page: number;
  pageCount: number;
}

function statusFor(state: EditorState): Status {
  const { $from } = state.selection;
  const typeName = $from.parent.type.name;
  const { page, pageCount } = pageStatus(state);
  return {
    element: isElementType(typeName) ? ELEMENT_LABELS[typeName] : '',
    page,
    pageCount
  };
}

export const ProseMirrorEditor: React.FC<ProseMirrorEditorProps> = ({ initialContent = '', onContentChange, titlePage, onTitlePageChange, onReady, onStateChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const [status, setStatus] = useState<Status>({ element: 'Action', page: 1, pageCount: 1 });
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [showScenes, setShowScenes] = useState(() => {
    try {
      return localStorage.getItem('editor.showScenes') !== 'false';
    } catch {
      return true;
    }
  });
  const toggleScenes = () => {
    setShowScenes(v => {
      try {
        localStorage.setItem('editor.showScenes', String(!v));
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: contentToDoc(initialContent),
      plugins: [
        history(),
        completionPlugin(), // before the keymap so Tab/Enter can accept a suggestion
        elementMenuPlugin(), // before the keymap so arrows/Enter drive the menu when open
        smartTypePlugin(),
        keymap(screenplayKeymap),
        keymap(baseKeymap),
        autoFormatPlugin(),
        clipboardPlugin(),
        searchPlugin(),
        dropCursor(),
        gapCursor(),
        pageViewPlugin
      ]
    });

    const view = new EditorView(editorRef.current, {
      state,
      attributes: { class: 'ProseMirror screenplay', spellcheck: 'true' },
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        setEditorState(newState);
        onStateChangeRef.current?.(newState);
        if (transaction.docChanged || transaction.selectionSet) {
          setStatus(statusFor(newState));
        }
        if (transaction.docChanged && onChangeRef.current) {
          onChangeRef.current(docToContent(newState.doc));
        }
      }
    });

    viewRef.current = view;
    setStatus(statusFor(state));
    setEditorState(state);
    onReadyRef.current?.(view);
    onStateChangeRef.current?.(state);
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor owns its document after mount; a new project remounts it via `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="prosemirror-editor-wrapper">
      <div className="toolbar">
        <span className="toolbar-info">
          <span className="toolbar-element">{status.element}</span>
          <span className="toolbar-sep">•</span>
          Page {status.page} of {status.pageCount}
        </span>
        <span className="toolbar-right">
          <span className="toolbar-hint">Enter on an empty line opens the element menu · ⌘1–⌘8 set element type</span>
          <button className={`toolbar-button ${showScenes ? 'active' : ''}`} onClick={toggleScenes} title="Show or hide the scene navigator">
            Scenes
          </button>
        </span>
      </div>
      {editorState && <FindBar view={viewRef.current} state={editorState} />}
      <div className="editor-body">
        {showScenes && editorState && <SceneNavigator view={viewRef.current} state={editorState} />}
        <div className="editor-scroll-container">
          {titlePage && onTitlePageChange && <TitleSheet data={titlePage} onChange={onTitlePageChange} />}
          <div ref={editorRef} className="prosemirror-editor" />
        </div>
      </div>
    </div>
  );
};

export default ProseMirrorEditor;
