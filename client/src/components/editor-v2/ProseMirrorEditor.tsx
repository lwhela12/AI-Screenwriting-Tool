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
import { focusPlugin, focusKey } from './plugins/focus';
import { FindBar } from './FindBar';
import { contentToDoc, docToContent } from './docConverter';
import { ELEMENT_LABELS, isElementType, ELEMENT_ORDER, ElementType } from './schema/screenplaySchema';
import { setElementTypeCommand } from './plugins/commands';
import { countWords } from './reports';
import { TitleSheet, TitlePageData } from './TitleSheet';
import { SceneNavigator } from './SceneNavigator';
import { Inspector } from './Inspector';
import { ChevronDownIcon } from '../../icons';
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
  showScenes?: boolean;
  showInspector?: boolean;
  focusMode?: boolean;
}

interface Status {
  element: ElementType | null;
  page: number;
  pageCount: number;
}

function statusFor(state: EditorState): Status {
  const { $from } = state.selection;
  const typeName = $from.parent.type.name;
  const { page, pageCount } = pageStatus(state);
  return { element: isElementType(typeName) ? typeName : null, page, pageCount };
}

export const ProseMirrorEditor: React.FC<ProseMirrorEditorProps> = ({
  initialContent = '',
  onContentChange,
  titlePage,
  onTitlePageChange,
  onReady,
  onStateChange,
  showScenes = true,
  showInspector = true,
  focusMode = false
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const [status, setStatus] = useState<Status>({ element: 'action', page: 1, pageCount: 1 });
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [sessionStartWords, setSessionStartWords] = useState(0);
  const [elementMenuOpen, setElementMenuOpen] = useState(false);

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
        focusPlugin(),
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
    setSessionStartWords(countWords(state.doc.textContent));
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

  // Focus mode is a plugin state so the dimming follows the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = focusKey.getState(view.state)?.enabled ?? false;
    if (current !== focusMode) view.dispatch(view.state.tr.setMeta(focusKey, { enabled: focusMode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, editorState === null]);

  const setElement = (type: ElementType) => {
    const view = viewRef.current;
    if (!view) return;
    setElementTypeCommand(type)(view.state, view.dispatch);
    setElementMenuOpen(false);
    view.focus();
  };

  return (
    <div className={`editor-frame${focusMode ? ' focus' : ''}`}>
      {editorState && <FindBar view={viewRef.current} state={editorState} />}
      <div className="editor-body">
        {showScenes && !focusMode && editorState && <SceneNavigator view={viewRef.current} state={editorState} />}
        <div className="editor-scroll-container">
          {titlePage && onTitlePageChange && <TitleSheet data={titlePage} onChange={onTitlePageChange} />}
          <div ref={editorRef} className="prosemirror-editor" />
        </div>
        {showInspector && !focusMode && editorState && <Inspector view={viewRef.current} state={editorState} sessionStartWords={sessionStartWords} />}
      </div>
      <div className="status-bar">
        <div className="status-element">
          <button className="status-element-button" onClick={() => setElementMenuOpen(o => !o)} title="Element type (⌘1–⌘8)">
            {status.element ? ELEMENT_LABELS[status.element] : '—'} <ChevronDownIcon />
          </button>
          {elementMenuOpen && (
            <div className="ui-popup status-element-menu" onMouseLeave={() => setElementMenuOpen(false)}>
              {ELEMENT_ORDER.map((type, i) => (
                <div key={type} className={`ui-popup-item${status.element === type ? ' selected' : ''}`} onClick={() => setElement(type)}>
                  <span>{ELEMENT_LABELS[type]}</span>
                  <span className="status-shortcut">⌘{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <span>
          Page {status.page} of {status.pageCount}
        </span>
        <span className="status-right">{editorState ? `${countWords(editorState.doc.textContent).toLocaleString()} words` : ''}</span>
      </div>
    </div>
  );
};

export default ProseMirrorEditor;
