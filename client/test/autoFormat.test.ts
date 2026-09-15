import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { undo, history } from 'prosemirror-history';
import { b, stateFor, outline, cursor, viewFor, type } from './helpers';
import { autoFormatPlugin } from '../src/components/editor-v2/plugins/autoFormat';
import { clipboardPlugin } from '../src/components/editor-v2/plugins/clipboard';
import { setElementTypeCommand } from '../src/components/editor-v2/plugins/commands';

const plugins = () => [history(), autoFormatPlugin(), clipboardPlugin()];
let views: EditorView[] = [];

function open(doc: any): EditorView {
  const view = viewFor(stateFor(doc, plugins()));
  views.push(view);
  return view;
}

afterEach(() => {
  views.forEach(v => v.destroy());
  views = [];
});

describe('typing into upper-case elements', () => {
  it('upper-cases characters as they are typed, wherever the cursor is', () => {
    const view = open(b.doc(b.ch('JO<a>N')));
    type(view, 'h');
    expect(outline(view.state.doc)).toEqual(['character: JOHN']);
    expect(cursor(view.state)).toEqual({ type: 'character', offset: 3 });
  });

  it('editing the middle of a scene heading does not move the cursor to the end', () => {
    const view = open(b.doc(b.sh('INT. HOSE<a> - DAY')));
    type(view, 'u');
    expect(outline(view.state.doc)).toEqual(['scene_heading: INT. HOSEU - DAY']);
    expect(cursor(view.state)).toEqual({ type: 'scene_heading', offset: 10 });
  });

  it('leaves action lines exactly as typed', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'the Cat sat');
    expect(outline(view.state.doc)).toEqual(['action: the Cat sat']);
  });
});

describe('action conversions', () => {
  it('"int." becomes a scene heading with a trailing space ready for the location', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'int.');
    expect(outline(view.state.doc)).toEqual(['scene_heading: INT. ']);
    expect(cursor(view.state)).toEqual({ type: 'scene_heading', offset: 5 });
    type(view, 'house');
    expect(outline(view.state.doc)).toEqual(['scene_heading: INT. HOUSE']);
  });

  it('a space typed right after the auto-inserted one is swallowed', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'int. office');
    expect(outline(view.state.doc)).toEqual(['scene_heading: INT. OFFICE']);
  });

  it('"ext " (no period) also converts', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'ext ');
    expect(outline(view.state.doc)).toEqual(['scene_heading: EXT ']);
  });

  it('"Interior" and "Extreme" stay action', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'Interior shot. Extreme close up.');
    expect(outline(view.state.doc)).toEqual(['action: Interior shot. Extreme close up.']);
  });

  it('"cut to:" becomes a transition', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'cut to:');
    expect(outline(view.state.doc)).toEqual(['transition: CUT TO:']);
  });

  it('any all-caps line ending in "TO:" becomes a transition', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'RIPPLE DISSOLVE TO:');
    expect(outline(view.state.doc)).toEqual(['transition: RIPPLE DISSOLVE TO:']);
  });

  it('"> text <" becomes centered text without the markers', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, '> THE END <');
    expect(outline(view.state.doc)).toEqual(['centered: THE END']);
  });

  it('a conversion can be undone in one step and is not re-applied', () => {
    const view = open(b.doc(b.a('<a>')));
    type(view, 'int.');
    expect(outline(view.state.doc)).toEqual(['scene_heading: INT. ']);
    undo(view.state, view.dispatch);
    expect(view.state.doc.firstChild!.type.name).toBe('action');
  });

  it('Mod-2 can force "INT. HOUSE" back to action and further typing keeps it action', () => {
    const view = open(b.doc(b.sh('INT. HOUSE<a>')));
    setElementTypeCommand('action')(view.state, view.dispatch);
    expect(outline(view.state.doc)).toEqual(['action: INT. HOUSE']);
    type(view, ' is quiet.');
    expect(outline(view.state.doc)).toEqual(['action: INT. HOUSE is quiet.']);
  });

  it('typing "int." at the start of an existing action line converts it', () => {
    const view = open(b.doc(b.a('<a> kitchen')));
    type(view, 'int.');
    expect(outline(view.state.doc)).toEqual(['scene_heading: INT. KITCHEN']);
    expect(cursor(view.state)).toEqual({ type: 'scene_heading', offset: 4 });
  });
});

describe('parentheticals', () => {
  it('"(" typed into an empty dialogue element turns it into a parenthetical', () => {
    const view = open(b.doc(b.ch('JOHN'), b.d('<a>')));
    type(view, '(');
    expect(outline(view.state.doc)).toEqual(['character: JOHN', 'parenthetical: ()']);
    expect(cursor(view.state)).toEqual({ type: 'parenthetical', offset: 1 });
    type(view, 'beat');
    expect(outline(view.state.doc)).toEqual(['character: JOHN', 'parenthetical: (beat)']);
  });

  it('typing ")" in front of the auto-inserted ")" steps over it', () => {
    const view = open(b.doc(b.p('(beat<a>)')));
    type(view, ')');
    expect(outline(view.state.doc)).toEqual(['parenthetical: (beat)']);
    expect(cursor(view.state)).toEqual({ type: 'parenthetical', offset: 6 });
  });
});

describe('paste', () => {
  it('pasted text into a character element is upper-cased', () => {
    const view = open(b.doc(b.ch('<a>')));
    const slice = stateFor(b.doc(b.a('mary'))).doc.slice(1, 5);
    const transformed = view.someProp('transformPasted', f => f(slice, view))!;
    view.dispatch(view.state.tr.replaceSelection(transformed));
    expect(outline(view.state.doc)).toEqual(['character: MARY']);
  });

  it('pasted text into action is left alone', () => {
    const view = open(b.doc(b.a('<a>')));
    const slice = stateFor(b.doc(b.a('mary'))).doc.slice(1, 5);
    const transformed = view.someProp('transformPasted', f => f(slice, view))!;
    view.dispatch(view.state.tr.replaceSelection(transformed));
    expect(outline(view.state.doc)).toEqual(['action: mary']);
  });
});

describe('selection safety', () => {
  it('a range selection is never auto-converted', () => {
    const view = open(b.doc(b.a('<a>int. house<b>')));
    view.dispatch(view.state.tr.insertText('x'));
    expect(view.state.doc.firstChild!.type.name).toBe('action');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    expect(view.state.doc.firstChild!.type.name).toBe('action');
  });
});
