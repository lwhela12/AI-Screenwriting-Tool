import { wrapText, WrappedLine } from './wrap';

/**
 * Screenplay pagination engine.
 *
 * Input: the script as a flat list of elements. Output: pages made of rows
 * (one per printed line) plus the list of page breaks with everything the
 * editor needs to draw them. The engine is pure and knows nothing about
 * ProseMirror or PDF; both consume its output so they always agree.
 *
 * Geometry is the US Letter standard: 12pt Courier (6 lines per inch,
 * 10 characters per inch), 1.5in left margin, 1in right margin, 1in top
 * margin, 55 lines of body per page.
 */

export type LayoutElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'centered'
  | 'page_break';

export type DualSide = 'left' | 'right';

export interface LayoutElement {
  type: LayoutElementType;
  text: string;
  /** On character cues: which column of a dual-dialogue pair this speech occupies. */
  dual?: DualSide | null;
}

export const PAGE = {
  /** 1in top and bottom margins leave 9in of body: 54 lines at 6 per inch. */
  linesPerPage: 54,
  linePt: 12,
  widthIn: 8.5,
  heightIn: 11,
  leftMarginIn: 1.5,
  rightMarginIn: 1.0,
  topMarginIn: 1.0,
  bottomMarginIn: 1.0,
  /** Page numbers sit inside the top margin. */
  pageNumberTopIn: 0.5
};

/**
 * Blank lines before each element type (Final Draft's "Space Before"); one
 * line unless listed here. Never applied inside a speech or at a page top.
 */
export const SPACE_BEFORE: Partial<Record<LayoutElementType, number>> = {
  scene_heading: 2,
  shot: 2
};

export interface Column {
  indent: number;
  width: number;
  align?: 'right' | 'center';
}

/**
 * Indent from the left margin and column width, in characters, per element.
 * These are Final Draft's screenplay template settings: action 1.5-7.5in,
 * character 3.5-7.25in, parenthetical 3.0-5.5in, dialogue 2.5-6.0in,
 * transition right-aligned at 7.1in.
 */
export const COLUMNS: Record<LayoutElementType | 'more' | 'contd', Column> = {
  scene_heading: { indent: 0, width: 60 },
  action: { indent: 0, width: 60 },
  character: { indent: 20, width: 37 },
  parenthetical: { indent: 15, width: 25 },
  dialogue: { indent: 10, width: 35 },
  transition: { indent: 36, width: 20, align: 'right' },
  shot: { indent: 0, width: 60 },
  centered: { indent: 0, width: 60, align: 'center' },
  page_break: { indent: 0, width: 60 },
  more: { indent: 15, width: 25 },
  contd: { indent: 20, width: 37 }
};

/** Columns for the two halves of dual dialogue: each half is 25 characters wide. */
export const DUAL_COLUMNS: Record<DualSide, Partial<Record<LayoutElementType, Column>>> = {
  left: {
    character: { indent: 5, width: 20 },
    parenthetical: { indent: 3, width: 22 },
    dialogue: { indent: 0, width: 25 }
  },
  right: {
    character: { indent: 35, width: 20 },
    parenthetical: { indent: 33, width: 22 },
    dialogue: { indent: 30, width: 25 }
  }
};

export function columnFor(type: LayoutElementType | 'more' | 'contd', side?: DualSide | null): Column {
  if (side) {
    const dual = (DUAL_COLUMNS[side] as Partial<Record<string, Column>>)[type];
    if (dual) return dual;
  }
  return COLUMNS[type];
}

const DIALOGUE_GROUP = new Set<LayoutElementType>(['character', 'parenthetical', 'dialogue']);

export type RowKind = 'text' | 'blank' | 'more' | 'contd' | 'dual';

export interface Row {
  kind: RowKind;
  /** Column used to print the row. */
  column: LayoutElementType | 'more' | 'contd';
  text: string;
  /** Index of the element this row belongs to. */
  elementIndex: number;
  /** For text rows: index of the wrapped line within the element. */
  lineIndex: number;
  /** For rows inside a dual-dialogue block. */
  dual?: DualSide;
  /** For `dual` rows: the printed line on each side (either may be missing). */
  left?: Row;
  right?: Row;
}

export interface Page {
  number: number;
  rows: Row[];
}

export interface PageBreak {
  /** Number of the page that starts at this break (2..n). */
  page: number;
  /** Element that starts the new page (or continues on it). */
  elementIndex: number;
  /** 0 = break before the element; k > 0 = break before wrapped line k of the element. */
  lineIndex: number;
  /** Rows used on the page that ends here, including a MORE row. */
  rowsBefore: number;
  /** "(MORE)" is printed at the bottom of the previous page. */
  more: boolean;
  /** "NAME (CONT'D)" is printed at the top of the new page. */
  contdCue: string | null;
}

export interface LaidOutElement extends LayoutElement {
  lines: WrappedLine[];
  /** True when blank rows separate this element from the previous one on the same page. */
  spacerBefore: boolean;
  /** How many blank rows precede it (0 when spacerBefore is false). */
  spacerRows: number;
  /** Page on which the element starts. */
  page: number;
  /** Set on every element of a dual-dialogue block. */
  dualSide?: DualSide;
}

export interface DualBlock {
  /** Element indices of the left and right speeches. */
  left: number[];
  right: number[];
  /** Printed lines in each column. */
  leftRows: number;
  rightRows: number;
}

export interface Layout {
  elements: LaidOutElement[];
  pages: Page[];
  breaks: PageBreak[];
  /** Dual-dialogue blocks, in document order. */
  duals: DualBlock[];
}

export function wrapElement(el: LayoutElement, side?: DualSide | null): WrappedLine[] {
  if (el.type === 'page_break') return [];
  return wrapText(el.text, columnFor(el.type, side).width);
}

export function contdCueFor(cue: string): string {
  const trimmed = cue.trim();
  if (/\(CONT'D\)\s*$/i.test(trimmed)) return trimmed;
  return `${trimmed} (CONT'D)`;
}

interface Unit {
  kind: 'single' | 'speech' | 'dual';
  /** Element indices in document order. */
  members: number[];
  /** For dual units: where the right speech starts within `members`. */
  split?: number;
}

function speechAt(elements: LaidOutElement[], i: number): number[] {
  const members = [i];
  let j = i + 1;
  while (j < elements.length && (elements[j].type === 'dialogue' || elements[j].type === 'parenthetical')) {
    members.push(j);
    j++;
  }
  return members;
}

function groupUnits(elements: LaidOutElement[]): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < elements.length) {
    const el = elements[i];
    if (el.type === 'character') {
      const left = speechAt(elements, i);
      const next = i + left.length;
      if (el.dual === 'left' && elements[next] && elements[next].type === 'character' && elements[next].dual === 'right') {
        const right = speechAt(elements, next);
        units.push({ kind: 'dual', members: [...left, ...right], split: left.length });
        i = next + right.length;
      } else {
        units.push({ kind: 'speech', members: left });
        i = next;
      }
    } else {
      units.push({ kind: 'single', members: [i] });
      i++;
    }
  }
  return units;
}

interface PaginatorOptions {
  linesPerPage: number;
  spaceBefore: Partial<Record<LayoutElementType, number>>;
  breakAtSentences: boolean;
}

/** Ends with a sentence: ., !, ? possibly followed by closing quotes or parentheses. */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

class Paginator {
  pages: Page[] = [];
  breaks: PageBreak[] = [];
  rows: Row[] = [];
  duals: DualBlock[] = [];
  readonly limit: number;

  constructor(private elements: LaidOutElement[], private options: PaginatorOptions) {
    this.limit = options.linesPerPage;
  }

  /**
   * Where to split an element that has `lines` lines left and room for `take`.
   * With sentence breaking on, prefer the last line (at or after `min`) that
   * ends a sentence; otherwise the line boundary. Never leaves fewer than
   * `min` lines on either side; returns 0 when no acceptable split exists.
   */
  splitPoint(index: number, from: number, lines: number, take: number, min: number): number {
    if (lines - take < min) take = lines - min;
    if (take < min) return 0;
    if (this.options.breakAtSentences) {
      const el = this.elements[index];
      for (let k = take; k >= min; k--) {
        if (SENTENCE_END.test(el.lines[from + k - 1].text)) return k;
      }
    }
    return take;
  }

  get remaining(): number {
    return this.limit - this.rows.length;
  }

  get pageNumber(): number {
    return this.pages.length + 1;
  }

  /** Blank rows before an element: none at the top of a page or inside a speech. */
  spacerFor(index: number): number {
    if (this.rows.length === 0) return 0;
    const el = this.elements[index];
    const prev = this.previousElementIndex();
    if (prev === null) return 0;
    const insideSpeech = (el.type === 'dialogue' || el.type === 'parenthetical') && DIALOGUE_GROUP.has(this.elements[prev].type);
    if (insideSpeech) return 0;
    return this.options.spaceBefore[el.type] ?? 1;
  }

  previousElementIndex(): number | null {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i];
      if (row.kind === 'text' || row.kind === 'contd' || row.kind === 'dual') return row.elementIndex;
    }
    return null;
  }

  pushBlank(index: number, count = 1) {
    for (let i = 0; i < count; i++) this.rows.push({ kind: 'blank', column: 'action', text: '', elementIndex: index, lineIndex: -1 });
  }

  textRow(index: number, k: number, side?: DualSide): Row {
    const el = this.elements[index];
    const row: Row = { kind: 'text', column: el.type, text: el.lines[k].text, elementIndex: index, lineIndex: k };
    if (side) row.dual = side;
    return row;
  }

  pushLines(index: number, from: number, to: number) {
    for (let k = from; k < to; k++) this.rows.push(this.textRow(index, k));
  }

  newPage(elementIndex: number, lineIndex: number, more: boolean, contdCue: string | null) {
    const rowsBefore = this.rows.length;
    this.pages.push({ number: this.pageNumber, rows: this.rows });
    this.breaks.push({ page: this.pageNumber, elementIndex, lineIndex, rowsBefore, more, contdCue });
    this.rows = [];
  }

  /** Place a whole element (assumes it fits). */
  placeWhole(index: number, withSpacer = true) {
    const el = this.elements[index];
    const spacer = withSpacer ? this.spacerFor(index) : 0;
    if (spacer) {
      this.pushBlank(index, spacer);
      el.spacerBefore = true;
      el.spacerRows = spacer;
    } else {
      el.spacerBefore = false;
      el.spacerRows = 0;
    }
    el.page = this.pageNumber;
    this.pushLines(index, 0, el.lines.length);
  }

  /** Rows the element after `index` needs on the same page to avoid an orphan (0 if none). */
  keepWithNextRows(index: number): number {
    const next = this.elements[index + 1];
    if (!next || next.type === 'page_break') return 0;
    if (next.type === 'character') return 1 + 2; // cue plus two lines of what follows
    return Math.min(2, next.lines.length);
  }

  placeSingle(index: number) {
    const el = this.elements[index];

    if (el.type === 'page_break') {
      el.spacerBefore = false;
      el.page = this.pageNumber;
      if (this.rows.length > 0) this.newPage(index, 0, false, null);
      return;
    }

    const spacer = this.spacerFor(index);
    const lines = el.lines.length;
    let keep = 0;
    if (el.type === 'scene_heading' || el.type === 'shot') keep = this.keepWithNextRows(index) + 1; // +1 for the blank before it

    if (spacer + lines + keep <= this.remaining) {
      this.placeWhole(index);
      return;
    }

    const splittable = el.type === 'action' || el.type === 'centered';
    const avail = this.remaining - spacer;
    const take = splittable && avail >= 2 ? this.splitPoint(index, 0, lines, avail, 2) : 0;
    if (take > 0) {
      if (spacer) this.pushBlank(index, spacer);
      el.spacerBefore = spacer > 0;
      el.spacerRows = spacer;
      el.page = this.pageNumber;
      this.pushLines(index, 0, take);
      this.newPage(index, take, false, null);
      this.placeRest(index, take);
      return;
    }

    if (this.rows.length > 0) {
      if (el.type === 'transition' && this.pullPreviousForTransition(index)) return;
      this.newPage(index, 0, false, null);
    }
    el.spacerBefore = false;
    el.page = this.pageNumber;
    if (lines <= this.limit) {
      this.pushLines(index, 0, lines);
    } else {
      this.pushLines(index, 0, this.limit);
      this.newPage(index, this.limit, false, null);
      this.placeRest(index, this.limit);
    }
  }

  /** Continue an element from line `from` on a fresh page, splitting further as needed. */
  placeRest(index: number, from: number) {
    const el = this.elements[index];
    let k = from;
    while (el.lines.length - k > this.limit) {
      this.pushLines(index, k, k + this.limit);
      k += this.limit;
      this.newPage(index, k, false, null);
    }
    this.pushLines(index, k, el.lines.length);
  }

  /**
   * A transition should not open a page. When the transition does not fit,
   * move the short element before it (if it is whole, short, and not alone
   * on the page) to the next page so the transition has company.
   * Returns true when the transition has been placed.
   */
  pullPreviousForTransition(index: number): boolean {
    const last = this.rows[this.rows.length - 1];
    if (!last || last.kind !== 'text') return false;
    const prevIndex = last.elementIndex;
    const prevEl = this.elements[prevIndex];
    if (prevEl.type === 'scene_heading' || prevEl.type === 'shot' || prevEl.type === 'transition' || prevEl.type === 'page_break') return false;
    let start = this.rows.length;
    while (start > 0 && this.rows[start - 1].elementIndex === prevIndex && this.rows[start - 1].kind === 'text') start--;
    const movedRows = this.rows.length - start;
    if (movedRows > 3 || this.rows[start].lineIndex !== 0) return false;
    if (start > 0 && this.rows[start - 1].kind === 'blank' && this.rows[start - 1].elementIndex === prevIndex) start--;
    if (start === 0) return false; // it is alone on the page; leave it
    this.rows = this.rows.slice(0, start);
    this.newPage(prevIndex, 0, false, null);
    this.placeWhole(prevIndex);
    this.placeWhole(index);
    return true;
  }

  placeSpeech(members: number[]) {
    const cueIndex = members[0];
    const body = members.slice(1);
    const cueText = this.elements[cueIndex].text;
    const cueLines = this.elements[cueIndex].lines.length;

    const spacer = this.spacerFor(cueIndex);
    const totalBody = body.reduce((sum, i) => sum + this.elements[i].lines.length, 0);
    const fitsWhole = spacer + cueLines + totalBody <= this.remaining;
    // If the speech will be split, the page also has to hold the "(MORE)" row.
    const need = cueLines + this.minimumBodyRows(body) + (fitsWhole || totalBody === 0 ? 0 : 1);

    if (spacer + need > this.remaining && this.rows.length > 0) {
      this.newPage(cueIndex, 0, false, null);
    }
    this.placeWhole(cueIndex);

    if (totalBody === 0) return;

    if (totalBody <= this.remaining) {
      for (const i of body) this.placeWhole(i, false);
      return;
    }

    // A split is coming: reserve one row for "(MORE)" on this page.
    let pending: { index: number; from: number }[] = body.map(index => ({ index, from: 0 }));
    let contd: string | null = null;

    while (pending.length > 0) {
      let limit = this.remaining - 1;
      const placedOnThisPage: boolean = this.rows.some(r => r.kind === 'text' && body.includes(r.elementIndex));
      // When the cue (or CONT'D cue) opens the page there is nowhere better to
      // move the speech, so any split that makes progress is allowed.
      const cueAtTop = this.rows.length > 0 && this.rows[0].elementIndex === cueIndex && this.rows[0].kind !== 'blank';
      let brokeAt: { index: number; line: number } | null = null;

      for (let p = 0; p < pending.length; p++) {
        const { index, from } = pending[p];
        const el = this.elements[index];
        const lines = el.lines.length - from;
        if (from === 0) {
          el.spacerBefore = false;
          el.page = this.pageNumber;
        }
        if (lines <= limit) {
          this.pushLines(index, from, el.lines.length);
          limit -= lines;
          continue;
        }
        if (el.type === 'dialogue' && limit >= 2) {
          const take = this.splitPoint(index, from, lines, limit, 2);
          if (take >= 2) {
            this.pushLines(index, from, from + take);
            brokeAt = { index, line: from + take };
            pending = pending.slice(p);
            pending[0] = { index, from: from + take };
            break;
          }
        }
        if (cueAtTop && limit >= 1) {
          const take = limit;
          this.pushLines(index, from, from + take);
          brokeAt = { index, line: from + take };
          pending = pending.slice(p);
          pending[0] = { index, from: from + take };
          break;
        }
        brokeAt = { index, line: from };
        pending = pending.slice(p);
        break;
      }

      if (!brokeAt) return; // everything placed

      const anyBodyPlaced = placedOnThisPage || this.rows.some(r => r.kind === 'text' && body.includes(r.elementIndex));
      if (!anyBodyPlaced && !cueAtTop) {
        // Only the cue made it onto this page: move the whole speech down instead.
        this.rollbackTo(cueIndex);
        this.newPage(cueIndex, 0, false, null);
        this.placeWhole(cueIndex);
        // Reset and try again on a fresh page.
        pending = body.map(index => ({ index, from: 0 }));
        contd = null;
        if (totalBody <= this.remaining) {
          for (const i of body) this.placeWhole(i, false);
          return;
        }
        continue;
      }

      contd = contdCueFor(cueText);
      this.rows.push({ kind: 'more', column: 'more', text: '(MORE)', elementIndex: brokeAt.index, lineIndex: brokeAt.line });
      this.newPage(brokeAt.index, brokeAt.line, true, contd);
      this.rows.push({ kind: 'contd', column: 'contd', text: contd, elementIndex: cueIndex, lineIndex: -1 });

      const totalPending = pending.reduce((sum, { index, from }) => sum + this.elements[index].lines.length - from, 0);
      if (totalPending <= this.remaining) {
        for (const { index, from } of pending) {
          const el = this.elements[index];
          if (from === 0) {
            el.spacerBefore = false;
            el.page = this.pageNumber;
          }
          this.pushLines(index, from, el.lines.length);
        }
        return;
      }
    }
  }

  /**
   * Dual dialogue: two speeches printed side by side. The block is never
   * split across pages; a block taller than a page falls back to two
   * ordinary speeches.
   */
  placeDual(members: number[], split: number) {
    const left = members.slice(0, split);
    const right = members.slice(split);
    const rowsOf = (indices: number[]) => indices.reduce((sum, i) => sum + this.elements[i].lines.length, 0);
    const leftRows = rowsOf(left);
    const rightRows = rowsOf(right);
    const height = Math.max(leftRows, rightRows);

    if (height > this.limit) {
      for (const i of members) {
        this.elements[i].dualSide = undefined;
        this.elements[i].lines = wrapElement(this.elements[i]);
      }
      this.placeSpeech(left);
      this.placeSpeech(right);
      return;
    }

    const cueIndex = left[0];
    if (this.spacerFor(cueIndex) + height > this.remaining && this.rows.length > 0) {
      this.newPage(cueIndex, 0, false, null);
    }

    const el0 = this.elements[cueIndex];
    const spacer0 = this.spacerFor(cueIndex);
    if (spacer0) {
      this.pushBlank(cueIndex, spacer0);
      el0.spacerBefore = true;
      el0.spacerRows = spacer0;
    } else {
      el0.spacerBefore = false;
      el0.spacerRows = 0;
    }
    for (const i of members) {
      const el = this.elements[i];
      el.page = this.pageNumber;
      if (i !== cueIndex) el.spacerBefore = false;
    }

    const column = (indices: number[], side: DualSide): Row[] => {
      const rows: Row[] = [];
      for (const i of indices) {
        for (let k = 0; k < this.elements[i].lines.length; k++) rows.push(this.textRow(i, k, side));
      }
      return rows;
    };
    const leftCol = column(left, 'left');
    const rightCol = column(right, 'right');
    for (let k = 0; k < height; k++) {
      this.rows.push({
        kind: 'dual',
        column: 'dialogue',
        text: '',
        elementIndex: cueIndex,
        lineIndex: k,
        left: leftCol[k],
        right: rightCol[k]
      });
    }
    this.duals.push({ left, right, leftRows, rightRows });
  }

  /** Remove every row belonging to elements from `index` onward from the current page. */
  rollbackTo(index: number) {
    let cut = this.rows.length;
    while (cut > 0 && this.rows[cut - 1].elementIndex >= index) cut--;
    this.rows = this.rows.slice(0, cut);
  }

  /** Rows a speech needs on the page with its cue so that the cue is never stranded. */
  minimumBodyRows(body: number[]): number {
    if (body.length === 0) return 0;
    const first = this.elements[body[0]];
    if (first.type === 'parenthetical') {
      const next = body[1] !== undefined ? this.elements[body[1]] : null;
      return first.lines.length + (next ? Math.min(2, next.lines.length) : 0);
    }
    return Math.min(2, first.lines.length);
  }

  finish(): { pages: Page[]; breaks: PageBreak[]; duals: DualBlock[] } {
    this.pages.push({ number: this.pageNumber, rows: this.rows });
    return { pages: this.pages, breaks: this.breaks, duals: this.duals };
  }
}

export interface LayoutOptions {
  linesPerPage?: number;
  /** Blank lines before each element type; defaults to SPACE_BEFORE (1 where unlisted). */
  spaceBefore?: Partial<Record<LayoutElementType, number>>;
  /** Split action and dialogue after the last complete sentence that fits (Final Draft's default). */
  breakAtSentences?: boolean;
  /** Custom wrapper, e.g. one that caches by document node. Not used for dual-dialogue members. */
  wrap?: (el: LayoutElement, index: number) => WrappedLine[];
}

export function layoutElements(input: LayoutElement[], options: LayoutOptions = {}): Layout {
  const wrap = options.wrap || ((el: LayoutElement) => wrapElement(el));
  const elements: LaidOutElement[] = input.map((el, i) => ({ ...el, lines: wrap(el, i), spacerBefore: false, spacerRows: 0, page: 1 }));

  const units = groupUnits(elements);
  // Members of a dual block wrap to the narrower dual columns.
  for (const unit of units) {
    if (unit.kind !== 'dual') continue;
    unit.members.forEach((index, k) => {
      const side: DualSide = k < (unit.split || 0) ? 'left' : 'right';
      elements[index].dualSide = side;
      elements[index].lines = wrapElement(elements[index], side);
    });
  }

  const paginator = new Paginator(elements, {
    linesPerPage: options.linesPerPage ?? PAGE.linesPerPage,
    spaceBefore: options.spaceBefore ?? SPACE_BEFORE,
    breakAtSentences: options.breakAtSentences ?? true
  });
  for (const unit of units) {
    if (unit.kind === 'dual') paginator.placeDual(unit.members, unit.split || 0);
    else if (unit.kind === 'speech') paginator.placeSpeech(unit.members);
    else paginator.placeSingle(unit.members[0]);
  }

  const { pages, breaks, duals } = paginator.finish();
  return { elements, pages, breaks, duals };
}

/** Page containing character offset `offset` of element `elementIndex`. */
export function pageAt(layout: Layout, elementIndex: number, offset: number): number {
  const el = layout.elements[elementIndex];
  let line = 0;
  if (el) {
    for (let k = 0; k < el.lines.length; k++) {
      if (el.lines[k].start <= offset) line = k;
      else break;
    }
  }
  let page = 1;
  for (const brk of layout.breaks) {
    if (brk.elementIndex < elementIndex || (brk.elementIndex === elementIndex && brk.lineIndex <= line)) page = brk.page;
    else break;
  }
  return page;
}
