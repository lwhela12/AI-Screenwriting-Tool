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

export interface LayoutElement {
  type: LayoutElementType;
  text: string;
}

export const PAGE = {
  linesPerPage: 55,
  linePt: 12,
  widthIn: 8.5,
  heightIn: 11,
  leftMarginIn: 1.5,
  rightMarginIn: 1.0,
  topMarginIn: 1.0,
  /** 11in - 1in top - 55 lines at 6 per inch. */
  bottomMarginIn: 11 - 1 - 55 / 6,
  /** Page numbers sit inside the top margin. */
  pageNumberTopIn: 0.5
};

/** Indent from the left margin and column width, in characters, per element. */
export const COLUMNS: Record<LayoutElementType | 'more' | 'contd', { indent: number; width: number; align?: 'right' | 'center' }> = {
  scene_heading: { indent: 0, width: 60 },
  action: { indent: 0, width: 60 },
  character: { indent: 22, width: 38 },
  parenthetical: { indent: 16, width: 25 },
  dialogue: { indent: 10, width: 35 },
  transition: { indent: 40, width: 20, align: 'right' },
  shot: { indent: 0, width: 60 },
  centered: { indent: 0, width: 60, align: 'center' },
  page_break: { indent: 0, width: 60 },
  more: { indent: 16, width: 25 },
  contd: { indent: 22, width: 38 }
};

const DIALOGUE_GROUP = new Set<LayoutElementType>(['character', 'parenthetical', 'dialogue']);

export type RowKind = 'text' | 'blank' | 'more' | 'contd';

export interface Row {
  kind: RowKind;
  /** Column used to print the row. */
  column: LayoutElementType | 'more' | 'contd';
  text: string;
  /** Index of the element this row belongs to. */
  elementIndex: number;
  /** For text rows: index of the wrapped line within the element. */
  lineIndex: number;
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
  /** True when a blank row separates this element from the previous one on the same page. */
  spacerBefore: boolean;
  /** Page on which the element starts. */
  page: number;
}

export interface Layout {
  elements: LaidOutElement[];
  pages: Page[];
  breaks: PageBreak[];
}

export function wrapElement(el: LayoutElement): WrappedLine[] {
  if (el.type === 'page_break') return [];
  return wrapText(el.text, COLUMNS[el.type].width);
}

export function contdCueFor(cue: string): string {
  const trimmed = cue.trim();
  if (/\(CONT'D\)\s*$/i.test(trimmed)) return trimmed;
  return `${trimmed} (CONT'D)`;
}

interface Unit {
  kind: 'single' | 'speech';
  /** Element indices in document order. */
  members: number[];
}

function groupUnits(elements: LaidOutElement[]): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < elements.length) {
    const el = elements[i];
    if (el.type === 'character') {
      const members = [i];
      let j = i + 1;
      while (j < elements.length && (elements[j].type === 'dialogue' || elements[j].type === 'parenthetical')) {
        members.push(j);
        j++;
      }
      units.push({ kind: 'speech', members });
      i = j;
    } else {
      units.push({ kind: 'single', members: [i] });
      i++;
    }
  }
  return units;
}

class Paginator {
  pages: Page[] = [];
  breaks: PageBreak[] = [];
  rows: Row[] = [];
  readonly limit: number;

  constructor(private elements: LaidOutElement[], linesPerPage: number) {
    this.limit = linesPerPage;
  }

  get remaining(): number {
    return this.limit - this.rows.length;
  }

  get pageNumber(): number {
    return this.pages.length + 1;
  }

  spacerFor(index: number): number {
    if (this.rows.length === 0) return 0;
    const el = this.elements[index];
    const prev = this.previousElementIndex();
    if (prev === null) return 0;
    if (DIALOGUE_GROUP.has(el.type) && DIALOGUE_GROUP.has(this.elements[prev].type)) return 0;
    return 1;
  }

  previousElementIndex(): number | null {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i];
      if (row.kind === 'text' || row.kind === 'contd') return row.elementIndex;
    }
    return null;
  }

  pushBlank(index: number) {
    this.rows.push({ kind: 'blank', column: 'action', text: '', elementIndex: index, lineIndex: -1 });
  }

  pushLines(index: number, from: number, to: number) {
    const el = this.elements[index];
    for (let k = from; k < to; k++) {
      this.rows.push({ kind: 'text', column: el.type, text: el.lines[k].text, elementIndex: index, lineIndex: k });
    }
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
    if (withSpacer && this.spacerFor(index)) {
      this.pushBlank(index);
      el.spacerBefore = true;
    } else {
      el.spacerBefore = false;
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
    if (splittable && avail >= 2 && lines - avail >= 2) {
      if (spacer) this.pushBlank(index);
      el.spacerBefore = spacer > 0;
      el.page = this.pageNumber;
      this.pushLines(index, 0, avail);
      this.newPage(index, avail, false, null);
      this.placeRest(index, avail);
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
          let take = limit;
          if (lines - take < 2) take = lines - 2; // never carry a single line over
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

  finish(): { pages: Page[]; breaks: PageBreak[] } {
    this.pages.push({ number: this.pageNumber, rows: this.rows });
    return { pages: this.pages, breaks: this.breaks };
  }
}

export interface LayoutOptions {
  linesPerPage?: number;
  /** Custom wrapper, e.g. one that caches by document node. */
  wrap?: (el: LayoutElement, index: number) => WrappedLine[];
}

export function layoutElements(input: LayoutElement[], options: LayoutOptions = {}): Layout {
  const wrap = options.wrap || wrapElement;
  const elements: LaidOutElement[] = input.map((el, i) => ({ ...el, lines: wrap(el, i), spacerBefore: false, page: 1 }));
  const paginator = new Paginator(elements, options.linesPerPage ?? PAGE.linesPerPage);

  for (const unit of groupUnits(elements)) {
    if (unit.kind === 'speech') paginator.placeSpeech(unit.members);
    else paginator.placeSingle(unit.members[0]);
  }

  const { pages, breaks } = paginator.finish();
  return { elements, pages, breaks };
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
