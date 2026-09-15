import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { b, stateFor, viewFor, outline, cursor } from './helpers';
import { clipboardPlugin } from '../src/components/editor-v2/plugins/clipboard';
import { ScreenplayParser } from '../src/utils/screenplayParser';

let views: EditorView[] = [];
function open(doc: any): EditorView {
  const view = viewFor(stateFor(doc, [clipboardPlugin()]));
  views.push(view);
  return view;
}
afterEach(() => {
  views.forEach(v => v.destroy());
  views = [];
});

/** Simulate a paste from another application (plain text, non-ProseMirror HTML). */
function paste(view: EditorView, text: string, html = ''): boolean {
  const event = {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : type === 'text/html' ? html : '')
    },
    preventDefault() {}
  } as unknown as ClipboardEvent;
  return !!view.someProp('handlePaste', f => f(view, event, null as any));
}

// One paragraph per line, no blank lines: what Final Draft puts on the clipboard.
const finalDraftText = [
  'BLACK SCREEN',
  'The sound of gunfire, helicopter blades and metal ricocheting. A sharp clang, then a long moment of silence.',
  'Beat.',
  'MALE VOICE (V.O.)',
  'Why are you here?',
  'CUT TO:',
  'INT. HELICOPTER - NIGHT',
  'NAOMI (mid-30’s) is slumped in the pilot seat, held in place by her shoulder straps. Her helmet is cracked.',
  'NAOMI',
  '(weakly)',
  'What? Sam?',
  'SAM (O.S.)',
  'Yeah. Listen, Naomi, there isn’t much time.',
  'Naomi shakes her head.'
].join('\n');

describe('ScreenplayParser on Final Draft clipboard text', () => {
  it('recognises every element from one-paragraph-per-line text', () => {
    // Known ambiguity: a capitalised action beat ("BLACK SCREEN") directly followed by
    // prose reads as a cue plus dialogue, exactly as Final Draft's own text import does.
    expect(ScreenplayParser.parse(finalDraftText).map(e => e.type)).toEqual([
      'character',
      'dialogue',
      'action',
      'character',
      'dialogue',
      'transition',
      'scene-heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'character',
      'dialogue',
      'action'
    ]);
  });

  it('leaves a capitalised action beat alone when nothing is spoken after it', () => {
    const els = ScreenplayParser.parse('BLACK SCREEN\nCUT TO:\nINT. A - DAY\nHe runs.');
    expect(els.map(e => e.type)).toEqual(['action', 'transition', 'scene-heading', 'action']);
  });

  it('still handles hard-wrapped text exports with blank lines', () => {
    const wrapped = ['INT. A - DAY', '', 'A long action line that', 'was wrapped by the export.', '', '          BOB', '     Hello there, this is', '     wrapped dialogue.', '', 'He leaves.'].join('\n');
    expect(ScreenplayParser.parse(wrapped)).toEqual([
      { type: 'scene-heading', text: 'INT. A - DAY' },
      { type: 'action', text: 'A long action line that was wrapped by the export.' },
      { type: 'character', text: 'BOB' },
      { type: 'dialogue', text: 'Hello there, this is wrapped dialogue.' },
      { type: 'action', text: 'He leaves.' }
    ]);
  });
});

describe('pasting into the editor', () => {
  it('turns multi-line text into typed elements instead of copies of the current element', () => {
    const view = open(b.doc(b.sh('INT. OFFICE - DAY'), b.sh('<a>')));
    expect(paste(view, finalDraftText)).toBe(true);
    const types = outline(view.state.doc).map(l => l.split(':')[0]);
    expect(types).toEqual([
      'scene_heading',
      'character',
      'dialogue',
      'action',
      'character',
      'dialogue',
      'transition',
      'scene_heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'character',
      'dialogue',
      'action'
    ]);
    // Character cues are upper-cased, action keeps its case.
    expect(view.state.doc.child(4).textContent).toBe('MALE VOICE (V.O.)');
    expect(view.state.doc.child(3).textContent).toBe('Beat.');
    expect(view.state.doc.child(8).textContent.startsWith('NAOMI (mid-30')).toBe(true);
    expect(cursor(view.state).type).toBe('action');
  });

  it('replaces the empty element the cursor is in rather than leaving it behind', () => {
    const view = open(b.doc(b.a('Before'), b.a('<a>')));
    paste(view, 'JOHN\nHello.');
    expect(outline(view.state.doc)).toEqual(['action: Before', 'character: JOHN', 'dialogue: Hello.']);
  });

  it('splits a non-empty element around the pasted blocks', () => {
    const view = open(b.doc(b.a('One <a>two')));
    paste(view, 'JOHN\nHello.');
    expect(outline(view.state.doc)).toEqual(['action: One ', 'character: JOHN', 'dialogue: Hello.', 'action: two']);
  });

  it('leaves single-line pastes and internal copies to the default handler', () => {
    const view = open(b.doc(b.a('<a>')));
    expect(paste(view, 'just one line')).toBe(false);
    expect(paste(view, 'JOHN\nHello.', '<p data-pm-slice="1 1 []">x</p>')).toBe(false);
  });
});
