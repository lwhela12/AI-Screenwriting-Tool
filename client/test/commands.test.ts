import { describe, it, expect } from 'vitest';
import { b, stateFor, run, outline, cursor } from './helpers';
import {
  enterCommand,
  tabCommand,
  shiftTabCommand,
  backspaceCommand,
  setElementTypeCommand
} from '../src/components/editor-v2/plugins/commands';
import { elementMenuKey } from '../src/components/editor-v2/plugins/commands';
import { elementMenuPlugin } from '../src/components/editor-v2/plugins/elementMenu';

describe('Enter', () => {
  it('scene heading -> action', () => {
    const s = run(stateFor(b.doc(b.sh('INT. HOUSE - DAY<a>'))), enterCommand)!;
    expect(outline(s.doc)).toEqual(['scene_heading: INT. HOUSE - DAY', 'action: ']);
    expect(cursor(s)).toEqual({ type: 'action', offset: 0 });
  });

  it('action -> action, character -> dialogue, parenthetical -> dialogue, dialogue -> action, transition -> scene heading', () => {
    expect(outline(run(stateFor(b.doc(b.a('He runs.<a>'))), enterCommand)!.doc)).toEqual(['action: He runs.', 'action: ']);
    expect(outline(run(stateFor(b.doc(b.ch('JOHN<a>'))), enterCommand)!.doc)).toEqual(['character: JOHN', 'dialogue: ']);
    expect(outline(run(stateFor(b.doc(b.p('(beat)<a>'))), enterCommand)!.doc)).toEqual(['parenthetical: (beat)', 'dialogue: ']);
    expect(outline(run(stateFor(b.doc(b.d('Hello.<a>'))), enterCommand)!.doc)).toEqual(['dialogue: Hello.', 'action: ']);
    expect(outline(run(stateFor(b.doc(b.t('CUT TO:<a>'))), enterCommand)!.doc)).toEqual(['transition: CUT TO:', 'scene_heading: ']);
  });

  it('mid-element split keeps the element type on both halves', () => {
    const s = run(stateFor(b.doc(b.d('Hello <a>world'))), enterCommand)!;
    expect(outline(s.doc)).toEqual(['dialogue: Hello ', 'dialogue: world']);
    expect(cursor(s)).toEqual({ type: 'dialogue', offset: 0 });
  });

  it('at the start of an element inserts an empty element of the same type above', () => {
    const s = run(stateFor(b.doc(b.a('<a>Text'))), enterCommand)!;
    expect(outline(s.doc)).toEqual(['action: ', 'action: Text']);
    expect(cursor(s)).toEqual({ type: 'action', offset: 0 });
  });

  it('closes an unbalanced parenthetical before moving on', () => {
    const s = run(stateFor(b.doc(b.p('(quietly<a>'))), enterCommand)!;
    expect(outline(s.doc)).toEqual(['parenthetical: (quietly)', 'dialogue: ']);
  });

  it('treats the cursor before a closing paren as the end of the parenthetical', () => {
    const s = run(stateFor(b.doc(b.p('(beat<a>)'))), enterCommand)!;
    expect(outline(s.doc)).toEqual(['parenthetical: (beat)', 'dialogue: ']);
  });

  it('on an empty element opens the element menu instead of inserting', () => {
    const s = run(stateFor(b.doc(b.a('Text'), b.a('<a>')), [elementMenuPlugin()]), enterCommand)!;
    expect(outline(s.doc)).toEqual(['action: Text', 'action: ']);
    expect(elementMenuKey.getState(s)?.open).toBe(true);
  });

  it('replaces a selection then behaves as at the end', () => {
    const s = run(stateFor(b.doc(b.a('Keep <a>drop<b>'))), enterCommand)!;
    expect(outline(s.doc)).toEqual(['action: Keep ', 'action: ']);
  });
});

describe('Tab', () => {
  it('empty action becomes character', () => {
    const s = run(stateFor(b.doc(b.a('<a>'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['character: ']);
  });

  it('non-empty action creates a character after it', () => {
    const s = run(stateFor(b.doc(b.a('John enters.<a>'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['action: John enters.', 'character: ']);
    expect(cursor(s)).toEqual({ type: 'character', offset: 0 });
  });

  it('character creates a parenthetical with the cursor inside the parens', () => {
    const s = run(stateFor(b.doc(b.ch('JOHN<a>'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['character: JOHN', 'parenthetical: ()']);
    expect(cursor(s)).toEqual({ type: 'parenthetical', offset: 1 });
  });

  it('parenthetical moves on to dialogue, closing the paren if needed', () => {
    const s = run(stateFor(b.doc(b.p('(beat<a>'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['parenthetical: (beat)', 'dialogue: ']);
  });

  it('empty parenthetical "()" converts to dialogue', () => {
    const s = run(stateFor(b.doc(b.p('(<a>)'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['dialogue: ']);
  });

  it('end of dialogue adds a parenthetical after it', () => {
    const s = run(stateFor(b.doc(b.d('Hi.<a>'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['dialogue: Hi.', 'parenthetical: ()']);
    expect(cursor(s)).toEqual({ type: 'parenthetical', offset: 1 });
  });

  it('mid-dialogue splits and drops a parenthetical between the halves', () => {
    const s = run(stateFor(b.doc(b.d('Hi. <a>Bye.'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['dialogue: Hi. ', 'parenthetical: ()', 'dialogue: Bye.']);
    expect(cursor(s)).toEqual({ type: 'parenthetical', offset: 1 });
  });

  it('scene heading: first Tab adds " - ", second Tab moves to action', () => {
    const s1 = run(stateFor(b.doc(b.sh('INT. HOUSE<a>'))), tabCommand)!;
    expect(outline(s1.doc)).toEqual(['scene_heading: INT. HOUSE - ']);
    expect(cursor(s1)).toEqual({ type: 'scene_heading', offset: 'INT. HOUSE - '.length });
    const s2 = run(stateFor(b.doc(b.sh('INT. HOUSE - DAY<a>'))), tabCommand)!;
    expect(outline(s2.doc)).toEqual(['scene_heading: INT. HOUSE - DAY', 'action: ']);
  });

  it('transition moves on to a scene heading', () => {
    const s = run(stateFor(b.doc(b.t('CUT TO:<a>'))), tabCommand)!;
    expect(outline(s.doc)).toEqual(['transition: CUT TO:', 'scene_heading: ']);
  });
});

describe('Shift-Tab', () => {
  it('steps back through the element order and applies conventions', () => {
    const s = run(stateFor(b.doc(b.a('john<a>'))), shiftTabCommand)!;
    expect(outline(s.doc)).toEqual(['scene_heading: JOHN']);
    expect(cursor(s)).toEqual({ type: 'scene_heading', offset: 4 });
  });
});

describe('Backspace', () => {
  it('at start of an empty element removes it and lands at the end of the previous one', () => {
    const s = run(stateFor(b.doc(b.a('Text'), b.ch('<a>'))), backspaceCommand)!;
    expect(outline(s.doc)).toEqual(['action: Text']);
    expect(cursor(s)).toEqual({ type: 'action', offset: 4 });
  });

  it('at start of a non-empty element joins it onto the previous element', () => {
    const s = run(stateFor(b.doc(b.a('Text'), b.d('<a>more'))), backspaceCommand)!;
    expect(outline(s.doc)).toEqual(['action: Textmore']);
    expect(cursor(s)).toEqual({ type: 'action', offset: 4 });
  });

  it('inside "()" removes both parentheses', () => {
    const s = run(stateFor(b.doc(b.ch('JOHN'), b.p('(<a>)'))), backspaceCommand)!;
    expect(outline(s.doc)).toEqual(['character: JOHN', 'parenthetical: ']);
  });

  it('removes a manual page break before the element', () => {
    const s = run(stateFor(b.doc(b.a('One'), b.pb(), b.a('<a>Two'))), backspaceCommand)!;
    expect(outline(s.doc)).toEqual(['action: One', 'action: Two']);
  });

  it('mid-text defers to the default handler', () => {
    expect(run(stateFor(b.doc(b.a('Te<a>xt'))), backspaceCommand)).toBeNull();
  });

  it('on the first element is a no-op rather than deleting it', () => {
    const s = run(stateFor(b.doc(b.a('<a>Only'))), backspaceCommand)!;
    expect(outline(s.doc)).toEqual(['action: Only']);
  });
});

describe('Mod-N element shortcuts', () => {
  it('sets the element type and upper-cases where required, keeping the cursor', () => {
    const s = run(stateFor(b.doc(b.a('bob <a>smith'))), setElementTypeCommand('character'))!;
    expect(outline(s.doc)).toEqual(['character: BOB SMITH']);
    expect(cursor(s)).toEqual({ type: 'character', offset: 4 });
  });

  it('converting to parenthetical wraps the text in parentheses', () => {
    const s = run(stateFor(b.doc(b.d('beat<a>'))), setElementTypeCommand('parenthetical'))!;
    expect(outline(s.doc)).toEqual(['parenthetical: (beat)']);
    expect(cursor(s)).toEqual({ type: 'parenthetical', offset: 5 });
  });

  it('applies to every element in a range selection', () => {
    const s = run(stateFor(b.doc(b.a('o<a>ne'), b.a('tw<b>o'))), setElementTypeCommand('dialogue'))!;
    expect(outline(s.doc)).toEqual(['dialogue: one', 'dialogue: two']);
  });

  it('preserves marks when upper-casing', () => {
    const doc = b.doc(b.a('a ', b.italic('quiet'), ' word<a>'));
    const s = run(stateFor(doc), setElementTypeCommand('scene_heading'))!;
    const first = s.doc.firstChild!;
    expect(first.textContent).toBe('A QUIET WORD');
    expect(first.child(1).marks.map(m => m.type.name)).toEqual(['italic']);
  });
});
