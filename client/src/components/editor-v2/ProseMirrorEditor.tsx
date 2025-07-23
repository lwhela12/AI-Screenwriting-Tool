import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { screenplaySchema, createPage } from './schema/screenplaySchema';
import { screenplayKeymap } from './plugins/screenplayKeymap';
import { pageViewPlugin } from './plugins/pageView';
import { createInputRules } from './plugins/inputRules';
import { gapCursor } from 'prosemirror-gapcursor';
import './ProseMirrorEditor.css';

interface ProseMirrorEditorProps {
  initialContent?: string;
  onContentChange?: (content: string) => void;
  projectTitle?: string;
  projectAuthor?: string;
  projectContact?: string;
}

export const ProseMirrorEditor: React.FC<ProseMirrorEditorProps> = ({
  initialContent = '',
  onContentChange,
  projectTitle = 'Untitled',
  projectAuthor,
  projectContact
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [pageStatus, setPageStatus] = useState('Page 1 of 1');

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    // Create initial document with one page
    const doc = screenplaySchema.nodes.doc.create({}, [createPage(1)]);

    // Create editor state
    const state = EditorState.create({
      doc,
      schema: screenplaySchema,
      plugins: [
        history(),
        keymap({ ...screenplayKeymap, 'Mod-z': undo, 'Mod-y': redo }),
        keymap(baseKeymap),
        createInputRules(),
        gapCursor(),
        pageViewPlugin
      ]
    });

    // Create editor view
    const view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        
        // Update page status and notify parent
        if (transaction.docChanged || transaction.selection) {
          const pageCount = newState.doc.content.childCount;
          const selection = newState.selection;
          let currentPage = 1;
          
          // Find which page the cursor is on
          let offset = 0;
          newState.doc.forEach((node, nodeOffset) => {
            if (nodeOffset <= selection.from && nodeOffset + node.nodeSize > selection.from) {
              return false; // Found it
            }
            currentPage++;
          });
          
          setPageStatus(`Page ${currentPage} of ${pageCount}`);
          
          // Notify parent of content change
          if (transaction.docChanged && onContentChange) {
            const content = newState.doc.toJSON();
            onContentChange(JSON.stringify(content));
          }
        }
      },
      attributes: {
        class: 'ProseMirror',
        spellcheck: 'true'
      }
    });

    // Focus the editor
    view.focus();

    viewRef.current = view;

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []); // Only create once

  return (
    <div className="prosemirror-editor-wrapper">
      <div className="toolbar">
        <span className="toolbar-info">{pageStatus} • Screenplay Format</span>
      </div>
      <div className="editor-scroll-container">
        <div ref={editorRef} className="prosemirror-editor" />
      </div>
    </div>
  );
};

export default ProseMirrorEditor;