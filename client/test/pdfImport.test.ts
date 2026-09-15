import { describe, it, expect } from 'vitest';
import { outline } from './helpers';
import { pdfLinesToScript, detectMargin, mergeItemsIntoLines, PdfLine } from '../src/utils/pdfImport';

/** Build positioned lines the way a Final Draft PDF lays them out (1.5in margin, 12pt lines). */
function page(page: number, rows: [x: number, text: string][], startY = 72): PdfLine[] {
  return rows.map(([x, text], i) => ({ page, x, y: startY + i * 12, width: text.length * 7, text }));
}
const M = 108; // margin
const D = 180; // dialogue
const P = 216; // parenthetical
const C = 252; // character
const T = 432; // transition (right aligned)

describe('pdf import', () => {
  it('detects the margin as the leftmost well-used indent, not the most common one', () => {
    const lines: PdfLine[] = [...page(1, [[M, 'INT. A - DAY'], [M, 'Action.'], [D, 'a'], [D, 'b'], [D, 'c'], [D, 'd'], [D, 'e']])];
    expect(detectMargin(lines)).toBe(M);
  });

  it('merges split items on one baseline and drops duplicated header text', () => {
    const items: PdfLine[] = [
      { page: 1, x: 108, y: 100, width: 70, text: 'Hello ' },
      { page: 1, x: 178, y: 100, width: 42, text: 'there.' },
      { page: 1, x: 508, y: 45, width: 14, text: '2.' },
      { page: 1, x: 508, y: 45, width: 14, text: '2.' }
    ];
    const merged = mergeItemsIntoLines(items);
    expect(merged.map(l => l.text)).toEqual(['2.', 'Hello there.']);
  });

  it('classifies elements by indent and joins wrapped lines', () => {
    const lines = [
      ...page(1, [
        [508, '1.'],
        [M, 'INT. KITCHEN - DAY'],
        [M, 'Bob enters, soaked to the'],
        [M, 'bone.'],
        [C, 'BOB'],
        [P, '(dripping all over the'],
        [P, 'floor)'],
        [D, 'Wet out there. Really, really'],
        [D, 'wet.'],
        [C, 'MARY (V.O.)'],
        [D, 'Told you.'],
        [T, 'CUT TO:'],
        [M, 'EXT. STREET - NIGHT'],
        [280, 'THE END']
      ])
    ];
    // Put the page number where a header sits.
    lines[0].y = 45;
    const { doc } = pdfLinesToScript(lines);
    expect(outline(doc)).toEqual([
      'scene_heading: INT. KITCHEN - DAY',
      'action: Bob enters, soaked to the bone.',
      'character: BOB',
      'parenthetical: (dripping all over the floor)',
      'dialogue: Wet out there. Really, really wet.',
      'character: MARY (V.O.)',
      'dialogue: Told you.',
      'transition: CUT TO:',
      'scene_heading: EXT. STREET - NIGHT',
      'centered: THE END'
    ]);
  });

  it('rejoins a speech split across pages with (MORE) and (CONT\'D)', () => {
    const lines = [
      ...page(1, [
        [M, 'INT. A - DAY'],
        [C, 'BOB'],
        [D, 'First part of the speech'],
        [P, '(MORE)']
      ]),
      ...page(2, [
        [C, "BOB (CONT'D)"],
        [D, 'and the rest of it.'],
        [M, 'Bob leaves.']
      ])
    ];
    const { doc } = pdfLinesToScript(lines);
    expect(outline(doc)).toEqual(['scene_heading: INT. A - DAY', 'character: BOB', 'dialogue: First part of the speech and the rest of it.', 'action: Bob leaves.']);
  });

  it('reads a title page and skips it', () => {
    const lines = [
      ...page(1, [
        [230, 'RAIN'],
        [250, 'Written by'],
        [240, 'Jane Writer']
      ], 300),
      { page: 1, x: 108, y: 640, width: 100, text: 'jane@example.com' },
      { page: 1, x: 108, y: 652, width: 60, text: '555-0100' },
      ...page(2, [[M, 'INT. A - DAY'], [M, 'Rain.']])
    ];
    const imp = pdfLinesToScript(lines);
    expect(imp.title).toBe('RAIN');
    expect(imp.author).toBe('Jane Writer');
    expect(imp.contact).toBe('jane@example.com\n555-0100');
    expect(outline(imp.doc)).toEqual(['scene_heading: INT. A - DAY', 'action: Rain.']);
  });

  it('keeps scene numbers printed beside headings', () => {
    const { doc } = pdfLinesToScript(page(1, [[M, '12 INT. A - DAY 12'], [M, 'Rain.']]));
    expect(doc.child(0).attrs.number).toBe('12');
    expect(doc.child(0).textContent).toBe('INT. A - DAY');
  });
});
