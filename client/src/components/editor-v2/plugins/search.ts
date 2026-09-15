import { Plugin, PluginKey, EditorState, Transaction, TextSelection, Command } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { UPPERCASE_ELEMENTS } from '../schema/screenplaySchema';

/**
 * Find and replace. Matches are found within each element's text, kept up
 * to date as the document changes, highlighted with decorations, and
 * stepped through with the cursor. Replacing inside a scene heading,
 * character or transition keeps the element's capitalisation.
 */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchState {
  open: boolean;
  query: string;
  replacement: string;
  options: SearchOptions;
  matches: SearchMatch[];
  /** Index into `matches` of the current match, or -1. */
  current: number;
}

export const searchKey = new PluginKey<SearchState>('search');

const INITIAL: SearchState = {
  open: false,
  query: '',
  replacement: '',
  options: { caseSensitive: false, wholeWord: false },
  matches: [],
  current: -1
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRegExp(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null;
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${escapeRegExp(query)}(?![\\p{L}\\p{N}_])` : escapeRegExp(query);
  return new RegExp(source, options.caseSensitive ? 'gu' : 'giu');
}

/** All matches of `query` in the document, in document order. */
export function findMatches(doc: PMNode, query: string, options: SearchOptions): SearchMatch[] {
  const re = buildRegExp(query, options);
  if (!re) return [];
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      matches.push({ from: pos + 1 + m.index, to: pos + 1 + m.index + m[0].length });
    }
    return false;
  });
  return matches;
}

/** The first match at or after the selection, so "find" starts from where the writer is. */
function nearestMatch(matches: SearchMatch[], pos: number): number {
  if (!matches.length) return -1;
  const idx = matches.findIndex(m => m.from >= pos);
  return idx === -1 ? 0 : idx;
}

function recompute(state: SearchState, doc: PMNode, selectionFrom: number, keepCurrent: SearchMatch | null): SearchState {
  const matches = findMatches(doc, state.query, state.options);
  let current = -1;
  if (keepCurrent) current = matches.findIndex(m => m.from === keepCurrent.from);
  if (current === -1) current = nearestMatch(matches, selectionFrom);
  return { ...state, matches, current };
}

export function searchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => INITIAL,
      apply(tr: Transaction, state: SearchState, _old: EditorState, newState: EditorState): SearchState {
        const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
        if (meta) {
          const next = { ...state, ...meta };
          if ('query' in meta || 'options' in meta || (meta.open && !state.open) || tr.docChanged) {
            return recompute(next, newState.doc, newState.selection.from, null);
          }
          return next;
        }
        if (!state.open || !state.matches.length) return state;
        if (tr.docChanged) {
          const current = state.current >= 0 ? state.matches[state.current] : null;
          const mapped = current ? { from: tr.mapping.map(current.from), to: tr.mapping.map(current.to) } : null;
          return recompute(state, newState.doc, newState.selection.from, mapped);
        }
        return state;
      }
    },
    props: {
      decorations(state) {
        const s = searchKey.getState(state);
        if (!s || !s.open || !s.matches.length) return DecorationSet.empty;
        return DecorationSet.create(
          state.doc,
          s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'search-match search-match-current' : 'search-match' }))
        );
      }
    }
  });
}

/** Open the find bar (from Mod-F). */
export const openSearch: Command = (state, dispatch) => {
  const s = searchKey.getState(state);
  if (!s) return false;
  if (dispatch) {
    // Seed the query with the selected text when there is a short selection.
    const { from, to } = state.selection;
    const selected = from !== to && to - from < 80 ? state.doc.textBetween(from, to, ' ') : '';
    dispatch(state.tr.setMeta(searchKey, { open: true, ...(selected && !selected.includes('\n') ? { query: selected } : {}) }));
  }
  return true;
};

export const closeSearch: Command = (state, dispatch) => {
  const s = searchKey.getState(state);
  if (!s || !s.open) return false;
  if (dispatch) dispatch(state.tr.setMeta(searchKey, { open: false }));
  return true;
};

function goTo(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, index: number): boolean {
  const s = searchKey.getState(state);
  if (!s || !s.matches.length) return false;
  const i = ((index % s.matches.length) + s.matches.length) % s.matches.length;
  const m = s.matches[i];
  if (dispatch) {
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, m.from, m.to)).setMeta(searchKey, { current: i }).scrollIntoView());
  }
  return true;
}

/** Move to the next match. If the current match is not selected yet, select it first. */
export const findNext: Command = (state, dispatch) => {
  const s = searchKey.getState(state);
  if (!s || !s.matches.length) return false;
  const cur = s.current >= 0 ? s.matches[s.current] : null;
  const selectedAlready = cur && state.selection.from === cur.from && state.selection.to === cur.to;
  return goTo(state, dispatch, selectedAlready ? s.current + 1 : s.current >= 0 ? s.current : 0);
};

export const findPrevious: Command = (state, dispatch) => {
  const s = searchKey.getState(state);
  if (!s || !s.matches.length) return false;
  const cur = s.current >= 0 ? s.matches[s.current] : null;
  const selectedAlready = cur && state.selection.from === cur.from && state.selection.to === cur.to;
  return goTo(state, dispatch, selectedAlready ? s.current - 1 : s.current >= 0 ? s.current : 0);
};

function replacementFor(doc: PMNode, from: number, replacement: string): string {
  const $from = doc.resolve(from);
  return UPPERCASE_ELEMENTS.has($from.parent.type.name) ? replacement.toUpperCase() : replacement;
}

/** Replace the current match and move on to the next one. */
export const replaceCurrent: Command = (state, dispatch) => {
  const s = searchKey.getState(state);
  if (!s || s.current < 0 || !s.matches[s.current]) return false;
  const m = s.matches[s.current];
  if (dispatch) {
    const text = replacementFor(state.doc, m.from, s.replacement);
    const tr = state.tr.insertText(text, m.from, m.to);
    // Land on the match that follows this one (already mapped by the plugin on apply).
    tr.setSelection(TextSelection.create(tr.doc, m.from + text.length));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Replace every match in one undoable step. Returns false when there is nothing to replace. */
export const replaceAll: Command = (state, dispatch) => {
  const s = searchKey.getState(state);
  if (!s || !s.matches.length) return false;
  if (dispatch) {
    const tr = state.tr;
    // Work backwards so earlier positions stay valid.
    for (let i = s.matches.length - 1; i >= 0; i--) {
      const m = s.matches[i];
      tr.insertText(replacementFor(state.doc, m.from, s.replacement), m.from, m.to);
    }
    dispatch(tr.setMeta(searchKey, { current: -1 }).scrollIntoView());
  }
  return true;
};

/** Update the search inputs. */
export function setSearch(state: EditorState, dispatch: (tr: Transaction) => void, patch: Partial<Pick<SearchState, 'query' | 'replacement' | 'options'>>): void {
  dispatch(state.tr.setMeta(searchKey, patch));
}
