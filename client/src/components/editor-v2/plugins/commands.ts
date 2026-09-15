import { Transaction, TextSelection, Command, PluginKey } from 'prosemirror-state';
import { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import {
  screenplaySchema,
  ElementType,
  ELEMENT_FLOW,
  ELEMENT_ORDER,
  UPPERCASE_ELEMENTS,
  isElementType,
  upperSameLength
} from '../schema/screenplaySchema';

/** Shared with the element menu plugin; the Enter command opens the menu through it. */
export const elementMenuKey = new PluginKey<ElementMenuState>('elementMenu');

/**
 * Transactions carrying this meta (value 'converted') were produced by an
 * explicit element-type change; the auto-format plugin leaves them alone so
 * that Mod-2 can turn "INT. HOUSE" back into an action element.
 */
export const autoFormatKey = new PluginKey('autoFormat');

export interface ElementMenuState {
  open: boolean;
  selected: number;
}

/** A parenthetical containing only its parentheses counts as empty. */
export function isEffectivelyEmpty(node: PMNode): boolean {
  if (node.content.size === 0) return true;
  if (node.type.name === 'parenthetical') {
    return node.textContent.replace(/[()]/g, '').trim().length === 0;
  }
  return false;
}

/**
 * Replace the text of the block at `nodePos` with its upper-case form.
 * Marks are preserved and the text length never changes, so any selection
 * inside the node can be restored to the same numeric positions.
 */
export function uppercaseNodeText(tr: Transaction, nodePos: number): boolean {
  const node = tr.doc.nodeAt(nodePos);
  if (!node) return false;
  const edits: { from: number; to: number; text: string; marks: readonly any[] }[] = [];
  node.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    const up = upperSameLength(child.text);
    if (up !== child.text) {
      const from = nodePos + 1 + offset;
      edits.push({ from, to: from + child.nodeSize, text: up, marks: child.marks });
    }
  });
  if (edits.length === 0) return false;
  const { from, to } = tr.selection;
  for (const e of edits.reverse()) {
    tr.replaceWith(e.from, e.to, screenplaySchema.text(e.text, e.marks as any));
  }
  restoreTextSelection(tr, from, to);
  return true;
}

function restoreTextSelection(tr: Transaction, from: number, to: number) {
  const max = tr.doc.content.size;
  try {
    tr.setSelection(TextSelection.create(tr.doc, Math.min(from, max), Math.min(to, max)));
  } catch {
    /* leave the mapped selection in place */
  }
}

/** Make sure a parenthetical's text is wrapped in parentheses, keeping the cursor sensible. */
export function ensureParentheses(tr: Transaction, nodePos: number): void {
  const node = tr.doc.nodeAt(nodePos);
  if (!node) return;
  const start = nodePos + 1;
  const text = node.textContent;
  const cursor = tr.selection.from;

  if (text.length === 0) {
    tr.insertText('()', start);
    tr.setSelection(TextSelection.create(tr.doc, start + 1));
    return;
  }

  let newCursor = cursor;
  if (!text.startsWith('(')) {
    tr.insertText('(', start);
    if (cursor >= start) newCursor += 1;
  }
  const updated = tr.doc.nodeAt(nodePos)!;
  const end = nodePos + 1 + updated.content.size;
  if (!updated.textContent.endsWith(')')) {
    tr.insertText(')', end);
  }
  if (cursor >= start && cursor <= end) {
    tr.setSelection(TextSelection.create(tr.doc, Math.min(newCursor, end)));
  }
}

/** Close an unbalanced parenthetical (used when leaving it with Enter or Tab). */
export function closeParenthetical(tr: Transaction, nodePos: number): void {
  const node = tr.doc.nodeAt(nodePos);
  if (!node) return;
  const text = node.textContent;
  if (text.length > 0 && text.startsWith('(') && !text.endsWith(')')) {
    tr.insertText(')', nodePos + 1 + node.content.size);
  }
}

/**
 * Change the element type of the block at `nodePos`, applying that element's
 * text conventions (upper case, parentheses). The cursor stays where it was.
 */
export function setElementType(tr: Transaction, nodePos: number, type: ElementType): boolean {
  const node = tr.doc.nodeAt(nodePos);
  if (!node || !isElementType(node.type.name)) return false;
  if (node.type.name !== type) {
    tr.setNodeMarkup(nodePos, screenplaySchema.nodes[type]);
  }
  if (UPPERCASE_ELEMENTS.has(type)) uppercaseNodeText(tr, nodePos);
  if (type === 'parenthetical') ensureParentheses(tr, nodePos);
  return true;
}

/** Command factory: set every element in the selection to `type`. Bound to Mod-1..Mod-7. */
export function setElementTypeCommand(type: ElementType): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const positions: number[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (isElementType(node.type.name)) positions.push(pos);
      return false;
    });
    if (positions.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of positions) setElementType(tr, tr.mapping.map(pos), type);
      dispatch(tr.setMeta(autoFormatKey, 'converted').scrollIntoView());
    }
    return true;
  };
}

/** Insert a new empty element of `type` after the block at `nodePos` and put the cursor in it. */
export function insertElementAfter(tr: Transaction, nodePos: number, type: ElementType): void {
  const node = tr.doc.nodeAt(nodePos)!;
  const after = nodePos + node.nodeSize;
  const isParen = type === 'parenthetical';
  const newNode = screenplaySchema.nodes[type].create({}, isParen ? screenplaySchema.text('()') : undefined);
  tr.insert(after, newNode);
  tr.setSelection(TextSelection.create(tr.doc, after + 1 + (isParen ? 1 : 0)));
}

/** True when the cursor is at the logical end of its element (ignoring a closing parenthesis). */
function cursorAtLogicalEnd($from: ResolvedPos): boolean {
  const node: PMNode = $from.parent;
  const offset: number = $from.parentOffset;
  if (offset === node.content.size) return true;
  if (node.type.name === 'parenthetical') {
    return node.textContent.slice(offset) === ')';
  }
  return false;
}

/**
 * Enter.
 *  - empty element: open the element menu
 *  - cursor at end: create the element that follows in the Final Draft flow
 *  - cursor mid-text: split the element, both halves keeping their type
 */
export const enterCommand: Command = (state, dispatch) => {
  if (!(state.selection instanceof TextSelection)) return false;
  const tr = state.tr;
  if (!tr.selection.empty) tr.deleteSelection();

  const $from = tr.selection.$from;
  const node = $from.parent;
  const typeName = node.type.name;
  if (!isElementType(typeName)) return false;
  const nodePos = $from.before();

  if (isEffectivelyEmpty(node)) {
    if (dispatch) dispatch(tr.setMeta(elementMenuKey, { open: true, selected: ELEMENT_ORDER.indexOf(typeName) }));
    return true;
  }

  if (cursorAtLogicalEnd($from)) {
    if (typeName === 'parenthetical') closeParenthetical(tr, nodePos);
    insertElementAfter(tr, nodePos, ELEMENT_FLOW[typeName].enter);
  } else {
    const pos = $from.pos;
    tr.split(pos);
    tr.setSelection(TextSelection.create(tr.doc, pos + 2));
  }

  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Tab.
 *  - scene heading: append " - " for the time of day, then move on to Action
 *  - empty element: convert it to the Tab target
 *  - otherwise: create the Tab target after the element (mid-dialogue Tab
 *    splits the dialogue and drops a parenthetical between the halves)
 */
export const tabCommand: Command = (state, dispatch) => {
  if (!(state.selection instanceof TextSelection)) return false;
  const { $from } = state.selection;
  const node = $from.parent;
  const typeName = node.type.name;
  if (!isElementType(typeName)) return false;
  if (!dispatch) return true;

  const tr = state.tr;
  const nodePos = $from.before();
  const target = ELEMENT_FLOW[typeName].tab;

  if (typeName === 'scene_heading' && !isEffectivelyEmpty(node)) {
    const text = node.textContent;
    if (!/\s-\s/.test(text)) {
      const end = nodePos + 1 + node.content.size;
      const suffix = /\s$/.test(text) ? '- ' : ' - ';
      tr.insertText(suffix, end);
      tr.setSelection(TextSelection.create(tr.doc, end + suffix.length));
    } else {
      insertElementAfter(tr, nodePos, 'action');
    }
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (isEffectivelyEmpty(node)) {
    if (node.content.size > 0) tr.delete(nodePos + 1, nodePos + 1 + node.content.size);
    setElementType(tr, nodePos, target);
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (typeName === 'parenthetical') closeParenthetical(tr, nodePos);

  if (typeName === 'dialogue' && !cursorAtLogicalEnd($from)) {
    const pos = $from.pos;
    tr.split(pos);
    // The first half now ends at pos + 1; insert the new element between the halves.
    const between = pos + 1;
    const newNode = screenplaySchema.nodes.parenthetical.create({}, screenplaySchema.text('()'));
    tr.insert(between, newNode);
    tr.setSelection(TextSelection.create(tr.doc, between + 2));
  } else {
    insertElementAfter(tr, nodePos, target);
  }

  dispatch(tr.scrollIntoView());
  return true;
};

/** Indices (and positions) of the speech containing document child `index`, or null. */
function speechAround(doc: PMNode, index: number): { cue: number; end: number } | null {
  let cue = index;
  while (cue >= 0 && doc.child(cue).type.name !== 'character') {
    const t = doc.child(cue).type.name;
    if (t !== 'dialogue' && t !== 'parenthetical') return null;
    cue--;
  }
  if (cue < 0) return null;
  let end = cue + 1;
  while (end < doc.childCount && (doc.child(end).type.name === 'dialogue' || doc.child(end).type.name === 'parenthetical')) end++;
  return { cue, end };
}

/**
 * Toggle dual dialogue for the speech under the cursor and the speech before
 * it: they are printed side by side. Toggling again separates them.
 */
export const toggleDualDialogue: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth < 1) return false;
  const doc = state.doc;
  const here = speechAround(doc, $from.index(0));
  if (!here) return false;

  const cueNode = doc.child(here.cue);
  const tr = state.tr;
  const setDual = (childIndex: number, value: string | null) => {
    let pos = 0;
    for (let i = 0; i < childIndex; i++) pos += doc.child(i).nodeSize;
    tr.setNodeMarkup(pos, undefined, { ...doc.child(childIndex).attrs, dual: value });
  };

  if (cueNode.attrs.dual === 'right') {
    // Split the pair: clear this cue and its left partner.
    const partner = speechAround(doc, here.cue - 1);
    setDual(here.cue, null);
    if (partner && doc.child(partner.cue).attrs.dual === 'left') setDual(partner.cue, null);
  } else if (cueNode.attrs.dual === 'left') {
    setDual(here.cue, null);
    if (here.end < doc.childCount && doc.child(here.end).type.name === 'character' && doc.child(here.end).attrs.dual === 'right') setDual(here.end, null);
  } else {
    const partner = speechAround(doc, here.cue - 1);
    if (!partner) return false; // needs a speech immediately before this one
    setDual(partner.cue, 'left');
    setDual(here.cue, 'right');
  }

  if (dispatch) dispatch(tr.setMeta(autoFormatKey, 'converted'));
  return true;
};

/** Shift-Tab: change the current element to the previous type in the element order. */
export const shiftTabCommand: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const typeName = $from.parent.type.name;
  if (!isElementType(typeName)) return false;
  if (!dispatch) return true;
  const index = ELEMENT_ORDER.indexOf(typeName);
  const prev = ELEMENT_ORDER[(index - 1 + ELEMENT_ORDER.length) % ELEMENT_ORDER.length];
  const tr = state.tr;
  setElementType(tr, $from.before(), prev);
  dispatch(tr.setMeta(autoFormatKey, 'converted').scrollIntoView());
  return true;
};

/**
 * Backspace at the start of an element.
 *  - "(|)" in a parenthetical: remove both parentheses
 *  - empty element: remove it and put the cursor at the end of the previous element
 *  - non-empty element: join it onto the previous element (previous type wins)
 */
export const backspaceCommand: Command = (state, dispatch) => {
  if (!(state.selection instanceof TextSelection) || !state.selection.empty) return false;
  const { $from } = state.selection;
  const node = $from.parent;
  const typeName = node.type.name;
  if (!isElementType(typeName)) return false;
  const nodePos = $from.before();

  if (typeName === 'parenthetical' && node.textContent === '()' && $from.parentOffset === 1) {
    if (dispatch) dispatch(state.tr.delete(nodePos + 1, nodePos + 3));
    return true;
  }

  if ($from.parentOffset > 0) return false;

  const index = $from.index(-1);
  const doc = state.doc;

  if (index === 0) {
    // First element of the document.
    if (node.content.size === 0 && doc.childCount > 1) {
      if (dispatch) {
        const tr = state.tr.delete(nodePos, nodePos + node.nodeSize);
        tr.setSelection(TextSelection.near(tr.doc.resolve(nodePos), 1));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    if (typeName !== 'action' && node.content.size === 0) {
      if (dispatch) {
        const tr = state.tr;
        setElementType(tr, nodePos, 'action');
        dispatch(tr);
      }
      return true;
    }
    return true; // nothing to do; swallow so the browser does not navigate
  }

  const prev = doc.child(index - 1);
  const prevPos = nodePos - prev.nodeSize;
  if (!dispatch) return true;
  const tr = state.tr;

  if (prev.type.name === 'page_break') {
    tr.delete(prevPos, nodePos);
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (node.content.size === 0) {
    tr.delete(nodePos, nodePos + node.nodeSize);
    tr.setSelection(TextSelection.create(tr.doc, nodePos - 1));
  } else {
    tr.join(nodePos);
    tr.setSelection(TextSelection.create(tr.doc, nodePos - 1));
  }
  dispatch(tr.scrollIntoView());
  return true;
};
