import { describe, it, expect } from 'vitest';
import { eq } from 'prosemirror-test-builder';
import { outline } from './helpers';
import { parseFountain, docToFountain } from '../src/utils/fountain';

const sample = `Title: RAIN
Credit: Written by
Author: Jane Writer
Contact:
    jane@example.com
    555-0100

# Act One

INT. KITCHEN - DAY #1#

= Bob arrives soaked.

John enters, *soaked*. He drops his **keys**.
Water everywhere.

JOHN (V.O.)
(dripping)
It's raining.

MARY
Told you.

JOHN ^
You did.

.MONTAGE - THE STORM

!BLACK SCREEN

@McAvoy
Lowercase name forced with an at sign.

> BURN TO WHITE

> THE END <

===

EXT. STREET - NIGHT

Rain. [[note to self: more rain]]

/* boneyard
JOHN
Nope.
*/

CUT TO:
`;

describe('parseFountain', () => {
  it('reads the title page', () => {
    const { title, author, contact } = parseFountain(sample);
    expect(title).toBe('RAIN');
    expect(author).toBe('Jane Writer');
    expect(contact).toBe('jane@example.com\n555-0100');
  });

  it('maps every element', () => {
    const { doc } = parseFountain(sample);
    expect(outline(doc)).toEqual([
      'scene_heading: INT. KITCHEN - DAY',
      'action: John enters, soaked. He drops his keys.\nWater everywhere.',
      'character: JOHN (V.O.)',
      'parenthetical: (dripping)',
      "dialogue: It's raining.",
      'character: MARY',
      'dialogue: Told you.',
      'character: JOHN',
      'dialogue: You did.',
      'scene_heading: MONTAGE - THE STORM',
      'action: BLACK SCREEN',
      'character: MCAVOY',
      'dialogue: Lowercase name forced with an at sign.',
      'transition: BURN TO WHITE',
      'centered: THE END',
      'page_break: ',
      'scene_heading: EXT. STREET - NIGHT',
      'action: Rain. ',
      'transition: CUT TO:'
    ]);
  });

  it('keeps scene numbers, synopses, structure labels, dual dialogue and emphasis', () => {
    const { doc } = parseFountain(sample);
    expect(doc.child(0).attrs).toMatchObject({ number: '1', synopsis: 'Bob arrives soaked.', structure: 'Act One' });
    expect(doc.child(5).attrs.dual).toBe('left');
    expect(doc.child(7).attrs.dual).toBe('right');
    const action = doc.child(1);
    const marked = [] as string[];
    action.forEach(n => n.marks.forEach(m => marked.push(`${m.type.name}:${n.text}`)));
    expect(marked).toEqual(['italic:soaked', 'bold:keys']);
  });

  it('handles plain scripts without a title page', () => {
    const { doc, title } = parseFountain('INT. A - DAY\n\nHe waits.\n\nBOB\nHi.\n');
    expect(title).toBeUndefined();
    expect(outline(doc)).toEqual(['scene_heading: INT. A - DAY', 'action: He waits.', 'character: BOB', 'dialogue: Hi.']);
  });
});

describe('docToFountain', () => {
  it('round-trips through import', () => {
    const first = parseFountain(sample);
    const text = docToFountain(first.doc, { title: first.title, author: first.author, contact: first.contact });
    const second = parseFountain(text);
    expect(eq(second.doc, first.doc)).toBe(true);
    expect(second.title).toBe('RAIN');
    expect(second.author).toBe('Jane Writer');
    expect(second.contact).toBe('jane@example.com\n555-0100');
  });

  it('forces ambiguous elements so they read back correctly', () => {
    const text = docToFountain(parseFountain(sample).doc);
    expect(text).toContain('!BLACK SCREEN');
    expect(text).toContain('.MONTAGE - THE STORM');
    expect(text).toContain('INT. KITCHEN - DAY #1#');
    expect(text).toContain('= Bob arrives soaked.');
    expect(text).toContain('# Act One');
    expect(text).toContain('JOHN ^');
    expect(text).toContain('> BURN TO WHITE');
    expect(text).toContain('> THE END <');
    expect(text).toContain('*soaked*');
    expect(text).toContain('**keys**');
  });
});
