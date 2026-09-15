import { Plugin, Transaction, TextSelection, EditorState } from 'prosemirror-state';
import { Fragment, Slice, Node as PMNode } from 'prosemirror-model';
import { screenplaySchema, UPPERCASE_ELEMENTS, isElementType } from '../schema/screenplaySchema';
import { setElementType, uppercaseNodeText, autoFormatKey } from './commands';

const SCENE_PREFIX = /^(INT|EXT|EST|I\/E|E\/I)(\.|\s)/i;
const SCENE_PREFIX_ONLY = /^(INT|EXT|EST|I\/E|E\/I)\.$/i;

const KNOWN_TRANSITIONS =
  /^(FADE IN|FADE OUT|FADE TO BLACK|FADE TO WHITE|FADE TO|CUT TO BLACK|CUT TO|DISSOLVE TO|SMASH CUT TO|SMASH CUT|MATCH CUT TO|MATCH CUT|JUMP CUT TO|TIME CUT TO|TIME CUT|WIPE TO|IRIS IN|IRIS OUT|BACK TO|INTERCUT WITH|INTERCUT):$/i;
/** Final Draft's rule: an all-caps paragraph ending in "TO:" is a transition. */
const GENERIC_TRANSITION = /^[A-Z][A-Z0-9 .'\-]*TO:$/;

const CENTERED = /^>\s*(.*?)\s*<$/;

function detectActionConversion(text: string): 'scene_heading' | 'transition' | 'centered' | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Keep trailing whitespace here: "ext " is the trigger for a scene heading.
  if (SCENE_PREFIX.test(text.trimStart())) return 'scene_heading';
  if (KNOWN_TRANSITIONS.test(trimmed) || GENERIC_TRANSITION.test(trimmed)) return 'transition';
  if (CENTERED.test(trimmed)) return 'centered';
  return null;
}

function uppercaseFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach(node => {
    if (node.isText && node.text) {
      nodes.push(screenplaySchema.text(node.text.toUpperCase(), node.marks));
    } else if (node.content.size > 0) {
      nodes.push(node.copy(uppercaseFragment(node.content)));
    } else {
      nodes.push(node);
    }
  });
  return Fragment.fromArray(nodes);
}

/**
 * Auto-formatting that only ever touches what was just typed.
 *
 *  - Text typed into a scene heading, character or transition is upper-cased
 *    as it is inserted (marks and cursor untouched).
 *  - "(" typed into an empty dialogue element turns it into a parenthetical.
 *  - Typing ")" in front of an existing ")" just steps over it.
 *  - An action element that starts with INT./EXT. becomes a scene heading;
 *    one that reads like a transition ("CUT TO:") becomes a transition;
 *    "> text <" becomes centered text. Conversion happens once and keeps
 *    the cursor where it was.
 */
export function autoFormatPlugin(): Plugin {
  return new Plugin({
    key: autoFormatKey,

    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        const $from = state.doc.resolve(from);
        const parent = $from.parent;
        const typeName = parent.type.name;
        if (!isElementType(typeName)) return false;

        // "int." was auto-converted and given its trailing space; a habitual
        // space typed right after it would produce "INT.  OFFICE", so drop it.
        if (typeName === 'scene_heading' && text === ' ' && from === to) {
          const before = parent.textContent.slice(0, $from.parentOffset);
          if (/^(INT|EXT|EST|I\/E|E\/I)\. $/i.test(before)) return true;
        }

        if (UPPERCASE_ELEMENTS.has(typeName)) {
          const upper = text.toUpperCase();
          if (upper !== text) {
            view.dispatch(state.tr.insertText(upper, from, to).setMeta(autoFormatKey, 'typed'));
            return true;
          }
          return false;
        }

        if (typeName === 'dialogue' && text === '(' && parent.content.size === 0) {
          const tr = state.tr;
          setElementType(tr, $from.before(), 'parenthetical');
          view.dispatch(tr.setMeta(autoFormatKey, 'typed'));
          return true;
        }

        if (typeName === 'parenthetical' && from === to) {
          const rest = parent.textContent.slice($from.parentOffset);
          if (text === ')' && rest.startsWith(')')) {
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
            return true;
          }
          if (text === '(' && $from.parentOffset === 0 && parent.textContent.startsWith('(')) {
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
            return true;
          }
        }

        return false;
      },

      transformPasted(slice, view) {
        const typeName = view.state.selection.$from.parent.type.name;
        if (!UPPERCASE_ELEMENTS.has(typeName)) return slice;
        return new Slice(uppercaseFragment(slice.content), slice.openStart, slice.openEnd);
      }
    },

    appendTransaction(transactions: readonly Transaction[], _oldState: EditorState, newState: EditorState) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      // Never re-format the result of an undo/redo or of our own conversions.
      if (transactions.some(tr => tr.getMeta('history$') || tr.getMeta(autoFormatKey) === 'converted')) return null;

      const sel = newState.selection;
      if (!(sel instanceof TextSelection) || !sel.empty) return null;

      const $from = sel.$from;
      const node = $from.parent;
      if (node.type.name !== 'action') return null;

      const target = detectActionConversion(node.textContent);
      if (!target) return null;

      // Convert only at the moment the trigger is typed: the INT./EXT. prefix at
      // the start, or the closing ":" / "<" at the end. Edits elsewhere in a line
      // that happens to start with "INT." (e.g. after Mod-2 forced it to action)
      // are left alone.
      const offset = $from.parentOffset;
      const atEnd = offset === node.content.size;
      if (target === 'scene_heading' && offset > 5) return null;
      if (target !== 'scene_heading' && !atEnd) return null;

      const tr = newState.tr;
      const nodePos = $from.before();

      if (target === 'centered') {
        const match = CENTERED.exec(node.textContent.trim());
        const inner = match ? match[1] : node.textContent;
        tr.setNodeMarkup(nodePos, screenplaySchema.nodes.centered);
        tr.replaceWith(nodePos + 1, nodePos + 1 + node.content.size, inner ? screenplaySchema.text(inner) : Fragment.empty);
        tr.setSelection(TextSelection.create(tr.doc, nodePos + 1 + inner.length));
      } else {
        setElementType(tr, nodePos, target);
        // "int." typed with nothing after it: add the space the writer is about to type.
        if (target === 'scene_heading' && SCENE_PREFIX_ONLY.test(node.textContent) && $from.parentOffset === node.content.size) {
          tr.insertText(' ', nodePos + 1 + node.content.size);
        }
      }

      return tr.setMeta(autoFormatKey, 'converted');
    }
  });
}

export { uppercaseNodeText, autoFormatKey };
