import { describe, it, expect } from 'vitest';
import { wrapText } from '../src/components/editor-v2/pagination/wrap';
import { layoutElements, LayoutElement, pageAt, Row } from '../src/components/editor-v2/pagination/layout';

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
/** Action text that wraps to exactly `lines` lines of 60 characters. */
const actionOf = (lines: number) => Array.from({ length: lines }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`).join('\n');
/** Dialogue text that wraps to exactly `lines` lines of 35 characters. */
const dialogueOf = (lines: number) => Array.from({ length: lines }, (_, i) => `dialogue line ${String(i + 1).padStart(2, '0')}`).join('\n');

const sh = (text = 'INT. ROOM - DAY'): LayoutElement => ({ type: 'scene_heading', text });
const a = (text: string): LayoutElement => ({ type: 'action', text });
const ch = (text = 'BOB'): LayoutElement => ({ type: 'character', text });
const p = (text = '(beat)'): LayoutElement => ({ type: 'parenthetical', text });
const d = (text: string): LayoutElement => ({ type: 'dialogue', text });
const t = (text = 'CUT TO:'): LayoutElement => ({ type: 'transition', text });
const pb = (): LayoutElement => ({ type: 'page_break', text: '' });

/**
 * The rule tests below use a plain 55-line page with one blank line before
 * every element and line-boundary splits, so their arithmetic is easy to
 * follow. The Final Draft defaults (54 lines, two blanks before headings,
 * sentence breaks) are tested separately at the end.
 */
const CLASSIC = { linesPerPage: 55, spaceBefore: {}, breakAtSentences: false };
const lay = (els: LayoutElement[], extra: Partial<typeof CLASSIC> = {}) => layoutElements(els, { ...CLASSIC, ...extra });

function pageText(rows: Row[]): string[] {
  return rows.map(r => (r.kind === 'blank' ? '' : `${r.column}: ${r.text}`));
}

describe('wrapText', () => {
  it('wraps greedily at spaces and drops trailing spaces from the printed line', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 15);
    expect(lines.map(l => l.text)).toEqual(['the quick brown', 'fox jumps over', 'the lazy dog']);
    expect(lines.map(l => l.start)).toEqual([0, 16, 31]);
  });

  it('breaks after hyphens but not before digits', () => {
    expect(wrapText('well-known', 6).map(l => l.text)).toEqual(['well-', 'known']);
    expect(wrapText('A-1 rating', 6).map(l => l.text)).toEqual(['A-1', 'rating']);
  });

  it('hard-breaks a word longer than the line', () => {
    expect(wrapText('abcdefghij', 4).map(l => l.text)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('keeps hanging spaces off the visible width', () => {
    expect(wrapText('ab   cd', 2).map(l => l.text)).toEqual(['ab', 'cd']);
  });

  it('honours explicit newlines and empty text', () => {
    expect(wrapText('one\ntwo', 10).map(l => l.text)).toEqual(['one', 'two']);
    expect(wrapText('', 10)).toEqual([{ text: '', start: 0, end: 0 }]);
  });
});

describe('layout basics', () => {
  it('separates elements with a blank row except inside a dialogue block', () => {
    const { pages } = lay([sh(), a('Bob enters.'), ch(), p(), d('Hi.'), a('He leaves.')]);
    expect(pageText(pages[0].rows)).toEqual([
      'scene_heading: INT. ROOM - DAY',
      '',
      'action: Bob enters.',
      '',
      'character: BOB',
      'parenthetical: (beat)',
      'dialogue: Hi.',
      '',
      'action: He leaves.'
    ]);
  });

  it('puts a blank row before every character cue, including between speeches', () => {
    const { pages } = lay([ch('A'), d('One.'), ch('B'), d('Two.'), ch('A'), p('(beat)'), d('Three.')]);
    expect(pageText(pages[0].rows)).toEqual([
      'character: A',
      'dialogue: One.',
      '',
      'character: B',
      'dialogue: Two.',
      '',
      'character: A',
      'parenthetical: (beat)',
      'dialogue: Three.'
    ]);
  });

  it('fills a page to 55 rows and starts the next without a leading blank', () => {
    const { pages, breaks } = lay([a(actionOf(30)), a(actionOf(24)), a('tail')]);
    expect(pages[0].rows.length).toBe(55);
    expect(breaks).toEqual([{ page: 2, elementIndex: 2, lineIndex: 0, rowsBefore: 55, more: false, contdCue: null }]);
    expect(pages[1].rows[0]).toMatchObject({ kind: 'text', text: 'tail' });
  });

  it('honours manual page breaks', () => {
    const { pages, breaks } = lay([a('one'), pb(), a('two')]);
    expect(pages.length).toBe(2);
    expect(breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0 });
    expect(pageText(pages[1].rows)).toEqual(['action: two']);
  });
});

describe('action splitting', () => {
  it('splits a long action across pages at a line boundary', () => {
    const { pages, breaks } = lay([a(actionOf(50)), a(actionOf(10))]);
    // 50 + blank = 51 rows; 4 remain, so 4 lines of the second action go on page 1.
    expect(pages[0].rows.length).toBe(55);
    expect(breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 4, more: false });
    expect(pages[1].rows.length).toBe(6);
  });

  it('never leaves a single line of action at the bottom or top of a page', () => {
    const bottom = lay([a(actionOf(52)), a(actionOf(10))]);
    // 52 + blank = 53; only 2 remain -> 2 lines allowed. With 53 + blank = 54, 1 remains -> move whole.
    expect(bottom.breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 2 });
    const single = lay([a(actionOf(53)), a(actionOf(10))]);
    expect(single.breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0 });
    const top = lay([a(actionOf(50)), a(actionOf(5))]);
    // 4 available; taking 4 would carry a single line, so take 3 and carry 2.
    expect(top.breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 3 });
  });
});

describe('scene headings', () => {
  it('moves a heading to the next page when fewer than two lines of its scene would follow', () => {
    const { breaks, elements } = lay([a(actionOf(52)), sh(), a(actionOf(5))]);
    expect(breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0 });
    expect(elements[1].page).toBe(2);
  });

  it('keeps a heading when two lines of the following action fit', () => {
    const { breaks } = lay([a(actionOf(49)), sh(), a(actionOf(5))]);
    // 49 + blank + heading = 51; blank + 3 lines of action fill the page, 2 carry over.
    expect(breaks[0]).toMatchObject({ elementIndex: 2, lineIndex: 3 });
  });
});

describe('dialogue', () => {
  it('splits long dialogue with (MORE) and a (CONT\'D) cue', () => {
    const { pages, breaks } = lay([a(actionOf(45)), ch('ALICE'), d(dialogueOf(12))]);
    // 45 + blank + cue = 47 rows; 8 remain, reserve 1 for MORE -> 7 lines, MORE.
    expect(pages[0].rows.length).toBe(55);
    expect(pages[0].rows[54]).toMatchObject({ kind: 'more', text: '(MORE)' });
    expect(breaks[0]).toEqual({ page: 2, elementIndex: 2, lineIndex: 7, rowsBefore: 55, more: true, contdCue: "ALICE (CONT'D)" });
    expect(pageText(pages[1].rows).slice(0, 2)).toEqual(["contd: ALICE (CONT'D)", 'dialogue: dialogue line 08']);
    expect(pages[1].rows.length).toBe(1 + 5);
  });

  it('does not double up an existing (CONT\'D) and keeps extensions', () => {
    const { breaks } = lay([a(actionOf(45)), ch("ALICE (V.O.) (CONT'D)"), d(dialogueOf(12))]);
    expect(breaks[0].contdCue).toBe("ALICE (V.O.) (CONT'D)");
  });

  it('never strands a character cue at the bottom of a page', () => {
    const { breaks, pages } = lay([a(actionOf(52)), ch(), d(dialogueOf(4))]);
    // 52 + blank + cue + 2 lines = 56 > 55 -> whole speech moves.
    expect(breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0, more: false, contdCue: null });
    expect(pages[0].rows.length).toBe(52);
    expect(pageText(pages[1].rows).slice(0, 2)).toEqual(['character: BOB', 'dialogue: dialogue line 01']);
  });

  it('dialogue that exactly fills the page is not split', () => {
    const { breaks, pages } = lay([a(actionOf(45)), ch(), d(dialogueOf(8))]);
    expect(breaks.length).toBe(0);
    expect(pages[0].rows.length).toBe(55);
    expect(pages[0].rows.some(r => r.kind === 'more')).toBe(false);
  });

  it('carries at least two lines when it does split', () => {
    const { breaks } = lay([a(actionOf(45)), ch(), d(dialogueOf(9))]);
    // 47 rows used, 8 remain, 7 usable -> 7 on this page, 2 carried.
    expect(breaks[0]).toMatchObject({ elementIndex: 2, lineIndex: 7, more: true });
  });

  it('breaks before a parenthetical rather than splitting it', () => {
    const { breaks, pages } = lay([a(actionOf(45)), ch(), d(dialogueOf(7)), p('(a long parenthetical here)'), d(dialogueOf(3))]);
    // 47 used; 8 remain, 7 usable -> dialogue (7) fits exactly, parenthetical needs 2 -> MORE, break before it.
    expect(breaks[0]).toMatchObject({ elementIndex: 3, lineIndex: 0, more: true, contdCue: "BOB (CONT'D)" });
    expect(pages[0].rows[54]).toMatchObject({ kind: 'more' });
    expect(pages[1].rows[1]).toMatchObject({ column: 'parenthetical' });
  });

  it('keeps a cue with its parenthetical and two lines of dialogue', () => {
    const { breaks } = lay([a(actionOf(50)), ch(), p(), d(dialogueOf(4))]);
    // 50 + blank + cue + paren + 2 lines = 55 leaves no row for (MORE) -> the whole speech moves.
    expect(breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0, more: false });
    const { pages } = lay([a(actionOf(50)), ch(), p(), d(dialogueOf(4))]);
    expect(pages[0].rows.length).toBe(50);
  });

  it('splits dialogue longer than a page repeatedly with CONT\'D each time', () => {
    const { pages, breaks } = lay([ch('LONG'), d(dialogueOf(120))]);
    expect(pages.length).toBe(3);
    expect(breaks.every(b => b.more && b.contdCue === "LONG (CONT'D)")).toBe(true);
    expect(pages[0].rows.length).toBe(55);
    expect(pages[1].rows.length).toBe(55);
    const printed = pages.flatMap(pg => pg.rows.filter(r => r.kind === 'text' && r.column === 'dialogue')).length;
    expect(printed).toBe(120);
  });
});

describe('transitions', () => {
  it('pulls a short preceding element down so a transition never opens a page', () => {
    const { pages, breaks } = lay([a(actionOf(51)), a('Short.'), t()]);
    // 51 + blank + Short. = 53; transition needs blank + 1 = 55 -> fits. Use 52 instead:
    const tight = lay([a(actionOf(52)), a('Short.'), t()]);
    expect(tight.breaks[0]).toMatchObject({ elementIndex: 1, lineIndex: 0 });
    expect(pageText(tight.pages[1].rows)).toEqual(['action: Short.', '', 'transition: CUT TO:']);
    expect(pages.length).toBe(1);
    expect(breaks.length).toBe(0);
  });
});

describe('pageAt', () => {
  it('maps an element offset to its page, including inside a split element', () => {
    const layout = lay([a(actionOf(50)), a(actionOf(10))]);
    expect(pageAt(layout, 0, 0)).toBe(1);
    expect(pageAt(layout, 1, 0)).toBe(1);
    const line4 = layout.elements[1].lines[4].start;
    expect(pageAt(layout, 1, line4 - 1)).toBe(1);
    expect(pageAt(layout, 1, line4)).toBe(2);
  });
});

describe('Final Draft defaults', () => {
  it('uses 54 lines per page and two blank lines before scene headings', () => {
    const { pages, elements } = layoutElements([a('Open.'), sh(), a('Text.')]);
    expect(pageText(pages[0].rows)).toEqual(['action: Open.', '', '', 'scene_heading: INT. ROOM - DAY', '', 'action: Text.']);
    expect(elements[1].spacerRows).toBe(2);
    const { pages: full } = layoutElements([a(actionOf(30)), a(actionOf(23)), a('tail')]);
    expect(full[0].rows.length).toBe(54);
    expect(full.length).toBe(2);
  });

  it('splits dialogue after the last complete sentence that fits', () => {
    // 45 action + blank + cue = 47 of 54 rows; 7 remain, 6 usable once (MORE) is reserved.
    // Sentence ends fall on lines 1, 3 and 8, so the split moves back from line 6 to line 3.
    const speech = ['Alpha.', 'beta', 'gamma.', 'delta', 'epsilon', 'zeta', 'eta', 'theta.'].join('\n');
    const opts = { linesPerPage: 54, spaceBefore: {} };
    const sentence = layoutElements([a(actionOf(45)), ch(), d(speech)], { ...opts, breakAtSentences: true });
    expect(sentence.breaks[0]).toMatchObject({ elementIndex: 2, lineIndex: 3, more: true });
    const boundary = layoutElements([a(actionOf(45)), ch(), d(speech)], { ...opts, breakAtSentences: false });
    expect(boundary.breaks[0]).toMatchObject({ elementIndex: 2, lineIndex: 6, more: true });
  });
});
