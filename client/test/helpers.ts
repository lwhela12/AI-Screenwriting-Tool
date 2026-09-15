import { builders } from 'prosemirror-test-builder';
import { EditorState, TextSelection, Transaction, Plugin, Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { screenplaySchema } from '../src/components/editor-v2/schema/screenplaySchema';

export const b = builders(screenplaySchema, {
  sh: { nodeType: 'scene_heading' },
  a: { nodeType: 'action' },
  ch: { nodeType: 'character' },
  p: { nodeType: 'parenthetical' },
  d: { nodeType: 'dialogue' },
  t: { nodeType: 'transition' },
  c: { nodeType: 'centered' },
  pb: { nodeType: 'page_break' }
}) as any;

/** Build a state from a tagged doc; the cursor goes to `<a>` (and `<b>` for a range). */
export function stateFor(doc: PMNode & { tag?: Record<string, number> }, plugins: Plugin[] = []): EditorState {
  const tag = doc.tag || {};
  const from = tag.a ?? 1;
  const to = tag.b ?? from;
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to), plugins });
}

/** Run a command and return the resulting state (or null when the command declined). */
export function run(state: EditorState, command: Command): EditorState | null {
  let result: EditorState | null = null;
  const handled = command(state, (tr: Transaction) => {
    result = state.apply(tr);
  });
  if (!handled) return null;
  return result ?? state;
}

/** Simple textual view of a document, one element per line: `type: text`. */
export function outline(doc: PMNode): string[] {
  const lines: string[] = [];
  doc.forEach(node => lines.push(`${node.type.name}: ${node.textContent}`));
  return lines;
}

/** The element type and offset of the cursor. */
export function cursor(state: EditorState): { type: string; offset: number } {
  const { $from } = state.selection;
  return { type: $from.parent.type.name, offset: $from.parentOffset };
}

export function viewFor(state: EditorState): EditorView {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  return new EditorView(mount, { state });
}

/** Simulate typing through the editor's text-input handlers, one character at a time. */
export function type(view: EditorView, text: string): void {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', f => f(view, from, to, ch, () => view.state.tr));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}
