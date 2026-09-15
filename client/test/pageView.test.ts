import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { b, stateFor, viewFor } from './helpers';
import { pageViewPlugin, pageStatus } from '../src/components/editor-v2/plugins/pageView';

const actionOf = (lines: number) => Array.from({ length: lines }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`).join('\n');
const dialogueOf = (lines: number) => Array.from({ length: lines }, (_, i) => `dialogue line ${String(i + 1).padStart(2, '0')}`).join('\n');

let views: EditorView[] = [];
function open(doc: any): EditorView {
  const view = viewFor(stateFor(doc, [pageViewPlugin]));
  views.push(view);
  return view;
}
afterEach(() => {
  views.forEach(v => v.destroy());
  views = [];
});

describe('page view decorations', () => {
  it('renders a block page gap before an element that starts a new page', () => {
    const view = open(b.doc(b.a(actionOf(30)), b.a(actionOf(23)), b.a('tail')));
    const gaps = view.dom.querySelectorAll('.page-gap');
    expect(gaps.length).toBe(1);
    const gap = gaps[0] as HTMLElement;
    expect(gap.tagName).toBe('DIV');
    expect(gap.nextElementSibling?.textContent).toBe('tail');
    expect(gap.querySelector('.page-gap-number')?.textContent).toBe('2.');
    expect(gap.style.getPropertyValue('--fill')).toBe('0pt');
    expect(pageStatus(view.state).pageCount).toBe(2);
  });

  it('renders an inline gap inside a split action at the first carried line', () => {
    const view = open(b.doc(b.a(actionOf(50)), b.a(actionOf(10))));
    const gap = view.dom.querySelector('.page-gap') as HTMLElement;
    expect(gap.tagName).toBe('SPAN');
    expect(gap.closest('p.action')).not.toBeNull();
    // 50 + blank = 51 rows; 3 remain, so line 4 is the first carried line.
    const after = gap.nextSibling?.textContent || '';
    expect(after.startsWith('line 04')).toBe(true);
  });

  it('prints (MORE) and the CONT\'D cue when a speech is split', () => {
    const view = open(b.doc(b.a(actionOf(45)), b.ch('ALICE'), b.d(dialogueOf(12))));
    const gap = view.dom.querySelector('.page-gap') as HTMLElement;
    expect(gap.closest('div.dialogue')).not.toBeNull();
    expect(gap.querySelector('.page-gap-more')?.textContent).toBe('(MORE)');
    expect(gap.querySelector('.page-gap-contd')?.textContent).toBe("ALICE (CONT'D)");
    expect(gap.style.getPropertyValue('--indent')).toBe('10ch');
  });

  it('marks elements that follow without a blank line', () => {
    const view = open(b.doc(b.sh('INT. A - DAY'), b.a('Text'), b.ch('BOB'), b.p('(beat)'), b.d('Hi.')));
    const classes = Array.from(view.dom.children).map(el => el.className);
    expect(classes[0]).toContain('no-spacer'); // first element
    expect(classes[1]).not.toContain('no-spacer');
    expect(classes[2]).not.toContain('no-spacer');
    expect(classes[3]).toContain('no-spacer');
    expect(classes[4]).toContain('no-spacer');
  });

  it('reports the cursor page, including inside a split element', () => {
    const view = open(b.doc(b.a(actionOf(50)), b.a(actionOf(10))));
    const second = view.state.doc.child(1);
    const secondStart = view.state.doc.child(0).nodeSize + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondStart)));
    expect(pageStatus(view.state)).toEqual({ page: 1, pageCount: 2 });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondStart + second.content.size)));
    expect(pageStatus(view.state)).toEqual({ page: 2, pageCount: 2 });
  });

  it('pads the last page out to a full sheet', () => {
    const view = open(b.doc(b.a('Short.')));
    // 1in bottom margin + (54 - 1) lines * 12pt = 96px + 848px in jsdom's normalised form.
    expect(view.dom.style.paddingBottom).toMatch(/944px|636pt/);
  });
});
