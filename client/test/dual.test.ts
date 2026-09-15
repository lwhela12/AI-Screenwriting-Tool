import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { b, stateFor, viewFor, run } from './helpers';
import { layoutElements, LayoutElement } from '../src/components/editor-v2/pagination/layout';
import { layoutFromDoc } from '../src/components/editor-v2/pagination/fromDoc';
import { pageViewPlugin } from '../src/components/editor-v2/plugins/pageView';
import { toggleDualDialogue } from '../src/components/editor-v2/plugins/commands';
import { docToFDX, parseFDX } from '../src/utils/fdx';

const actionOf = (lines: number) => Array.from({ length: lines }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`).join('\n');

const ch = (text: string, dual: 'left' | 'right' | null = null): LayoutElement => ({ type: 'character', text, dual });
const d = (text: string): LayoutElement => ({ type: 'dialogue', text });
const a = (text: string): LayoutElement => ({ type: 'action', text });

let views: EditorView[] = [];
afterEach(() => {
  views.forEach(v => v.destroy());
  views = [];
});

describe('dual dialogue in the engine', () => {
  it('lays two speeches out side by side as one block', () => {
    const { pages, duals, elements } = layoutElements([
      a('They speak at once.'),
      ch('ANNA', 'left'),
      d('I was going to say the same thing, honestly.'),
      ch('BEN', 'right'),
      d('Me too.'),
      a('Silence.')
    ]);
    expect(duals).toEqual([{ left: [1, 2], right: [3, 4], leftRows: 3, rightRows: 2 }]);
    // Dialogue wraps to the 25-character dual column, not the 35-character one.
    expect(elements[2].lines.map(l => l.text)).toEqual(['I was going to say the', 'same thing, honestly.']);
    const rows = pages[0].rows;
    expect(rows.map(r => r.kind)).toEqual(['text', 'blank', 'dual', 'dual', 'dual', 'blank', 'text']);
    expect(rows[2].left).toMatchObject({ column: 'character', text: 'ANNA', dual: 'left' });
    expect(rows[2].right).toMatchObject({ column: 'character', text: 'BEN', dual: 'right' });
    expect(rows[4].left).toMatchObject({ text: 'same thing, honestly.' });
    expect(rows[4].right).toBeUndefined();
  });

  it('is never split across a page and moves down whole', () => {
    const { breaks, pages } = layoutElements([a(actionOf(52)), ch('ANNA', 'left'), d('One.'), ch('BEN', 'right'), d('Two.\nThree.')]);
    expect(breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0 });
    expect(pages[0].rows.length).toBe(52);
    expect(pages[1].rows.every(r => r.kind === 'dual')).toBe(true);
  });

  it('ignores a "left" cue with no "right" partner', () => {
    const { duals, pages } = layoutElements([ch('ANNA', 'left'), d('Alone.'), a('Beat.')]);
    expect(duals).toEqual([]);
    expect(pages[0].rows.map(r => r.kind)).toEqual(['text', 'text', 'blank', 'text']);
  });
});

describe('dual dialogue in the editor', () => {
  it('marks the columns and pulls the right speech up beside the left', () => {
    const doc = b.doc(
      b.a('They speak at once.'),
      b.character({ dual: 'left' }, 'ANNA'),
      b.d('I was going to say the same thing, honestly.'),
      b.character({ dual: 'right' }, 'BEN'),
      b.d('Me too.'),
      b.a('Silence.')
    );
    const view = viewFor(stateFor(doc, [pageViewPlugin]));
    views.push(view);
    const children = Array.from(view.dom.children) as HTMLElement[];
    expect(children[1].className).toContain('dual-left');
    expect(children[2].className).toContain('dual-left');
    expect(children[3].className).toContain('dual-right');
    expect(children[3].style.marginTop).toBe('-36pt'); // 3 left rows
    expect(children[4].style.marginBottom).toBe('12pt'); // left is one row taller
    expect(layoutFromDoc(doc).layout.duals.length).toBe(1);
  });

  it('toggles a pair on and off with the command', () => {
    const doc = b.doc(b.ch('ANNA'), b.d('One.'), b.ch('BEN'), b.d('Tw<a>o.'));
    const on = run(stateFor(doc), toggleDualDialogue)!;
    expect(on.doc.child(0).attrs.dual).toBe('left');
    expect(on.doc.child(2).attrs.dual).toBe('right');
    const off = run(on, toggleDualDialogue)!;
    expect(off.doc.child(0).attrs.dual).toBeNull();
    expect(off.doc.child(2).attrs.dual).toBeNull();
  });

  it('declines when there is no speech before the cursor', () => {
    expect(run(stateFor(b.doc(b.a('Text'), b.ch('ANNA'), b.d('On<a>e.'))), toggleDualDialogue)).toBeNull();
  });

  it('round-trips through FDX as a DualDialogue block', () => {
    const doc = b.doc(b.character({ dual: 'left' }, 'ANNA'), b.d('One.'), b.character({ dual: 'right' }, 'BEN'), b.d('Two.'));
    const xml = docToFDX(doc, { title: 't' });
    expect(xml).toContain('<DualDialogue>');
    const again = parseFDX(xml).doc;
    expect(again.child(0).attrs.dual).toBe('left');
    expect(again.child(2).attrs.dual).toBe('right');
  });
});
