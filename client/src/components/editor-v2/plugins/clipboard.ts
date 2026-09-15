import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Fragment, Slice, Node as PMNode } from 'prosemirror-model';
import { screenplaySchema, UPPERCASE_ELEMENTS, isElementType } from '../schema/screenplaySchema';
import { elementsToDoc } from '../docConverter';
import { ScreenplayParser } from '../../../utils/screenplayParser';

export const clipboardKey = new PluginKey('clipboard');

function uppercaseFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach(node => {
    if (node.isText && node.text) nodes.push(screenplaySchema.text(node.text.toUpperCase(), node.marks));
    else if (node.content.size > 0) nodes.push(node.copy(uppercaseFragment(node.content)));
    else nodes.push(node);
  });
  return Fragment.fromArray(nodes);
}

/** True when the slice is a run of inline content (single-line paste). */
function isInlineSlice(slice: Slice): boolean {
  if (slice.content.childCount === 0) return true;
  let inline = true;
  slice.content.forEach(node => {
    if (!node.isInline) inline = false;
  });
  if (inline) return true;
  return slice.content.childCount === 1 && slice.openStart > 0 && slice.openEnd > 0;
}

/** Turn multi-line plain text into screenplay element nodes. */
export function textToElementNodes(text: string): PMNode[] {
  const nodes: PMNode[] = [];
  elementsToDoc(ScreenplayParser.parse(text)).forEach(node => nodes.push(node));
  return nodes;
}

export function insertElementNodes(view: EditorView, nodes: PMNode[]): void {
  if (nodes.length === 0) return;
  const { state } = view;
  const tr = state.tr;
  if (!tr.selection.empty) tr.deleteSelection();
  const $from = tr.selection.$from;
  const parent = $from.parent;

  if (isElementType(parent.type.name) && parent.content.size === 0) {
    // Replace the empty element the cursor is in.
    const from = $from.before();
    tr.replaceWith(from, from + parent.nodeSize, nodes);
    const end = from + nodes.reduce((sum, n) => sum + n.nodeSize, 0);
    tr.setSelection(TextSelection.near(tr.doc.resolve(end - 1), -1));
  } else {
    tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map($from.pos)), -1));
  }
  view.dispatch(tr.scrollIntoView());
}

/**
 * Clipboard behaviour.
 *
 *  - Text copied from another application (Final Draft, Word, a browser) is
 *    parsed line by line into screenplay elements, so cues, dialogue and
 *    headings arrive as themselves rather than as copies of whatever element
 *    the cursor was in.
 *  - Content copied from this editor keeps its element types (ProseMirror's
 *    own HTML format).
 *  - A single line pasted into a scene heading, character or transition is
 *    upper-cased like typed text.
 */
export function clipboardPlugin(): Plugin {
  return new Plugin({
    key: clipboardKey,
    props: {
      handlePaste(view, event) {
        const data = event.clipboardData;
        if (!data) return false;
        const html = data.getData('text/html');
        if (html && /data-pm-slice/.test(html)) return false; // internal copy: keep element types
        const text = data.getData('text/plain');
        if (!text) return false;
        const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length > 0);
        if (lines.length <= 1) return false; // single line: normal inline paste
        insertElementNodes(view, textToElementNodes(text));
        return true;
      },

      transformPasted(slice, view) {
        const typeName = view.state.selection.$from.parent.type.name;
        if (!UPPERCASE_ELEMENTS.has(typeName) || !isInlineSlice(slice)) return slice;
        return new Slice(uppercaseFragment(slice.content), slice.openStart, slice.openEnd);
      }
    }
  });
}
