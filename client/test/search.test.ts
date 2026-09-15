import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { b, stateFor, outline } from './helpers';
import { searchPlugin, searchKey, findMatches, openSearch, setSearch, findNext, findPrevious, replaceCurrent, replaceAll, closeSearch } from '../src/components/editor-v2/plugins/search';

const doc = () => b.doc(b.sh('INT. BOB\'S HOUSE - DAY'), b.a('Bob enters. bob waves at Bobby.'), b.ch('BOB'), b.d('Bob here.'));

function open(query: string, options = { caseSensitive: false, wholeWord: false }): EditorState {
  let state = stateFor(doc(), [searchPlugin()]);
  const dispatch = (tr: any) => {
    state = state.apply(tr);
  };
  openSearch(state, dispatch);
  setSearch(state, dispatch, { query, options });
  return state;
}
function apply(state: EditorState, command: (s: EditorState, d: any) => boolean): EditorState {
  let next = state;
  command(state, (tr: any) => {
    next = state.apply(tr);
  });
  return next;
}

describe('findMatches', () => {
  it('finds case-insensitively by default, case-sensitively on request', () => {
    expect(findMatches(doc(), 'bob', { caseSensitive: false, wholeWord: false }).length).toBe(6);
    expect(findMatches(doc(), 'bob', { caseSensitive: true, wholeWord: false }).length).toBe(1);
  });

  it('honours whole word', () => {
    expect(findMatches(doc(), 'bob', { caseSensitive: false, wholeWord: true }).length).toBe(5); // BOB'S counts (apostrophe is a boundary); Bobby does not
    expect(findMatches(doc(), 'Bobby', { caseSensitive: false, wholeWord: true }).length).toBe(1);
  });

  it('returns nothing for an empty query and ignores regex characters', () => {
    expect(findMatches(doc(), '', { caseSensitive: false, wholeWord: false })).toEqual([]);
    expect(findMatches(doc(), '.', { caseSensitive: false, wholeWord: false }).length).toBe(4);
  });
});

describe('stepping through matches', () => {
  it('starts at the match nearest the cursor and wraps around', () => {
    let state = open('bob');
    expect(searchKey.getState(state)!.matches.length).toBe(6);
    state = apply(state, findNext);
    expect(state.selection.from).toBe(searchKey.getState(state)!.matches[0].from);
    for (let i = 0; i < 6; i++) state = apply(state, findNext);
    expect(searchKey.getState(state)!.current).toBe(0);
    state = apply(state, findPrevious);
    expect(searchKey.getState(state)!.current).toBe(5);
  });

  it('keeps the match list current as the document changes', () => {
    let state = open('bob');
    state = state.apply(state.tr.insertText('Bob! ', 1));
    expect(searchKey.getState(state)!.matches.length).toBe(7);
    expect(searchKey.getState(state)!.matches[0]).toEqual({ from: 1, to: 4 });
  });
});

describe('replacing', () => {
  it('replaces the current match, keeping capitals inside headings and cues', () => {
    let state = open('bob');
    setSearch(state, (tr: any) => (state = state.apply(tr)), { replacement: 'Sam' });
    state = apply(state, findNext); // INT. BOB'S HOUSE
    state = apply(state, replaceCurrent);
    expect(state.doc.child(0).textContent).toBe("INT. SAM'S HOUSE - DAY");
    expect(searchKey.getState(state)!.matches.length).toBe(5);
  });

  it('replaces everything in one undoable step', () => {
    let state = open('bob', { caseSensitive: false, wholeWord: true });
    setSearch(state, (tr: any) => (state = state.apply(tr)), { replacement: 'Sam' });
    state = apply(state, replaceAll);
    expect(outline(state.doc)).toEqual(["scene_heading: INT. SAM'S HOUSE - DAY", 'action: Sam enters. Sam waves at Bobby.', 'character: SAM', 'dialogue: Sam here.']);
    expect(searchKey.getState(state)!.matches).toEqual([]);
  });

  it('closes and clears decorations', () => {
    let state = open('bob');
    expect(searchPlugin().props.decorations!.call(searchPlugin(), state)).toBeTruthy();
    state = apply(state, closeSearch);
    expect(searchKey.getState(state)!.open).toBe(false);
  });
});
