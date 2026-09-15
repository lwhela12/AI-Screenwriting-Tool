import { Node as PMNode } from 'prosemirror-model';
import { screenplaySchema, ElementType, emptyDoc } from '../components/editor-v2/schema/screenplaySchema';
import { stripContd, speakerName } from '../components/editor-v2/continued';

/**
 * PDF import.
 *
 * A screenplay PDF has no element information, but it has geometry: every
 * element type sits at a known indent. We read the text layer with
 * positions, find the left margin from the most common line start, and
 * classify each line by its offset from that margin. Wrapped lines are
 * joined, speeches split across pages with (MORE)/(CONT'D) are rejoined,
 * page numbers are dropped, and a title page is read when there is one.
 */

export interface PdfLine {
  page: number;
  /** Left edge in points from the page's left edge. */
  x: number;
  /** Top in points from the page's top edge. */
  y: number;
  width: number;
  text: string;
}

export interface PdfImport {
  doc: PMNode;
  title?: string;
  author?: string;
  contact?: string;
}

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i;
const PAGE_WIDTH = 612;
const LINE_PT = 12;

function isUpper(s: string): boolean {
  return s === s.toUpperCase() && /[A-Z]/.test(s);
}

/**
 * Read positioned lines from a PDF with pdf.js. `pdfjs` is the pdf.js module
 * (the browser build by default; tests pass the legacy Node build).
 */
export async function extractPdfLines(data: ArrayBuffer | Uint8Array, pdfjs: any): Promise<PdfLine[]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const lines: PdfLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const scaleX = PAGE_WIDTH / viewport.width; // normalise to US Letter width
    const content = await page.getTextContent();
    const items: PdfLine[] = [];
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      items.push({
        page: p,
        x: item.transform[4] * scaleX,
        y: (viewport.height - item.transform[5]) * scaleX,
        width: item.width * scaleX,
        text: item.str
      });
    }
    lines.push(...mergeItemsIntoLines(items));
  }
  return lines;
}

/** Items that share a baseline are one line; join them left to right. */
export function mergeItemsIntoLines(items: PdfLine[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < 3) {
      // Some exporters (Final Draft's headers) draw the same text twice in place.
      if (Math.abs(it.x - last.x) < 1 && last.text === it.text) continue;
      if (it.x < last.x + last.width - 2 && last.text.endsWith(it.text)) continue;
      const gap = it.x - (last.x + last.width);
      const needsSpace = gap > 2 && !last.text.endsWith(' ') && !it.text.startsWith(' ');
      last.text += (needsSpace ? ' ' : '') + it.text;
      last.width = it.x + it.width - last.x;
    } else {
      lines.push({ ...it });
    }
  }
  return lines;
}

interface Classified {
  type: ElementType | 'more' | 'skip';
  text: string;
  page: number;
  y: number;
}

/**
 * The left margin is the leftmost line start that a meaningful share of
 * lines use. (Not the most common one: a talky script has more dialogue
 * lines, at 2.5in, than action lines at 1.5in.)
 */
export function detectMargin(lines: PdfLine[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) {
    if (l.x > 200) continue;
    const key = Math.round(l.x);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size === 0) return 108;
  const max = Math.max(...counts.values());
  const candidates = [...counts.entries()].filter(([, n]) => n >= Math.max(2, max * 0.1)).sort((a, b) => a[0] - b[0]);
  return candidates.length ? candidates[0][0] : 108;
}

function classify(line: PdfLine, margin: number): Classified {
  const text = line.text.trim();
  const rel = line.x - margin;
  const center = line.x + line.width / 2;
  const right = line.x + line.width;
  const base = { text, page: line.page, y: line.y };

  if (/^(\d+[A-Z]?\.?\s*)+$/.test(text) && (line.y < 70 || line.y > 720)) return { ...base, type: 'skip' };
  if (/^\(MORE\)$/i.test(text)) return { ...base, type: 'more' };
  if (/^\(CONTINUED\)$|^CONTINUED:$/i.test(text)) return { ...base, type: 'skip' };

  if (rel < 40) {
    // Scene numbers may be printed before the heading: "12  INT. HOUSE - DAY  12".
    if (SCENE_RE.test(text.replace(/^\d+[A-Z]?\s+/, ''))) return { ...base, type: 'scene_heading' };
    return { ...base, type: 'action' };
  }
  const upperCue = isUpper(text.replace(/\(.*?\)/g, ''));
  if (isUpper(text) && rel >= 200 && right > 430 && /(TO:|OUT\.|IN:|BLACK\.)$/.test(text)) return { ...base, type: 'transition' };
  // Cues start at a fixed indent (3.5in in Final Draft's template); centered text does not.
  if (upperCue && rel >= 120 && rel < 165) return { ...base, type: 'character' };
  if (rel >= 85 && rel < 140 && text.startsWith('(')) return { ...base, type: 'parenthetical' };
  if (rel >= 45 && rel < 140) return { ...base, type: 'dialogue' };
  if (Math.abs(center - PAGE_WIDTH / 2) < 30) return { ...base, type: 'centered' };
  if (upperCue && rel >= 165 && rel < 260) return { ...base, type: 'character' };
  if (isUpper(text) && right > 430) return { ...base, type: 'transition' };
  return { ...base, type: 'action' };
}

interface Element {
  type: ElementType;
  text: string;
  attrs?: Record<string, any>;
}

/** Does the first page look like a title page rather than script? */
function isTitlePage(lines: PdfLine[]): boolean {
  if (lines.length === 0 || lines.length > 25) return false;
  if (lines.some(l => SCENE_RE.test(l.text.trim()))) return false;
  const centered = lines.filter(l => Math.abs(l.x + l.width / 2 - PAGE_WIDTH / 2) < 40).length;
  return centered >= 1;
}

function readTitlePage(lines: PdfLine[]): { title?: string; author?: string; contact?: string } {
  const texts = [...lines].sort((a, b) => a.y - b.y || a.x - b.x).map(l => l.text.trim()).filter(Boolean);
  if (!texts.length) return {};
  const title = texts[0];
  let author: string | undefined;
  for (let i = 1; i < texts.length; i++) {
    if (/^(written\s+)?by$/i.test(texts[i]) && texts[i + 1]) {
      author = texts[i + 1];
      break;
    }
    const m = /^(?:written\s+)?by\s+(.+)$/i.exec(texts[i]);
    if (m) {
      author = m[1];
      break;
    }
  }
  const bottom = lines.filter(l => l.y > 560 && l.x < 300).sort((a, b) => a.y - b.y).map(l => l.text.trim());
  const contact = bottom.length && bottom.join('\n') !== author ? bottom.join('\n') : undefined;
  return { title, author, contact };
}

/** Turn positioned lines into a script document. Pure; no pdf.js involved. */
export function pdfLinesToScript(allLines: PdfLine[]): PdfImport {
  const pages = new Map<number, PdfLine[]>();
  for (const l of allLines) {
    if (!pages.has(l.page)) pages.set(l.page, []);
    pages.get(l.page)!.push(l);
  }
  const pageNumbers = [...pages.keys()].sort((a, b) => a - b);
  let meta: { title?: string; author?: string; contact?: string } = {};
  let bodyPages = pageNumbers;
  if (pageNumbers.length > 1 && isTitlePage(pages.get(pageNumbers[0])!)) {
    meta = readTitlePage(pages.get(pageNumbers[0])!);
    bodyPages = pageNumbers.slice(1);
  }

  const body = bodyPages.flatMap(p => pages.get(p)!);
  const margin = detectMargin(body);

  const elements: Element[] = [];
  let prev: Classified | null = null;
  let lastSpeaker: string | null = null;
  let pendingMore = false;

  for (const page of bodyPages) {
    const lines = [...pages.get(page)!].sort((a, b) => a.y - b.y || a.x - b.x);
    // A page that follows a "(MORE)" continues the previous speech.
    const carry = pendingMore;
    pendingMore = false;
    let first = true;

    for (const line of lines) {
      const c = classify(line, margin);
      if (c.type === 'skip') continue;
      if (c.type === 'more') {
        pendingMore = true;
        continue;
      }

      const last = elements[elements.length - 1];
      const atTop = first;
      first = false;

      if (c.type === 'character') {
        const cue = stripContd(c.text);
        if (carry && atTop && lastSpeaker && speakerName(cue) === lastSpeaker) {
          // "NAME (CONT'D)" after a page break: the speech goes on, no new cue.
          prev = { ...c, type: 'dialogue' };
          continue;
        }
        lastSpeaker = speakerName(cue) || null;
        elements.push({ type: 'character', text: cue });
        prev = c;
        continue;
      }

      const nextLine = prev !== null && prev.page === c.page && c.y - prev.y < LINE_PT * 1.6;
      // A parenthetical that has not closed yet continues on the next line, which has no "(".
      if (nextLine && last?.type === 'parenthetical' && prev!.type === 'parenthetical' && !last.text.trimEnd().endsWith(')') && c.type === 'dialogue') {
        last.text += ' ' + c.text;
        prev = { ...c, type: 'parenthetical' };
        continue;
      }
      // A long scene heading wraps onto a second line at the margin, in capitals.
      if (nextLine && last?.type === 'scene_heading' && prev!.type === 'scene_heading' && c.type === 'action' && isUpper(c.text)) {
        last.text += ' ' + c.text;
        prev = { ...c, type: 'scene_heading' };
        continue;
      }
      const wrapped = nextLine && prev!.type === c.type;
      const resumed = carry && atTop && c.type === 'dialogue' && last?.type === 'dialogue';
      const joinable = c.type === 'action' || c.type === 'dialogue' || c.type === 'scene_heading' || (c.type === 'parenthetical' && !!last && !last.text.trimEnd().endsWith(')'));

      if (last && joinable && last.type === c.type && (wrapped || resumed)) {
        last.text += ' ' + c.text;
      } else {
        const attrs: Record<string, any> = {};
        let text = c.text;
        if (c.type === 'scene_heading') {
          // Scene numbers printed in the margins: "12  INT. HOUSE - DAY  12".
          const num = /^(\d+[A-Z]?)\s+(.*?)(?:\s+\1)?$/.exec(text);
          if (num) {
            attrs.number = num[1];
            text = num[2];
          }
        }
        elements.push({ type: c.type as ElementType, text, attrs });
      }
      prev = c;
    }
  }

  const nodes = elements.map(el => {
    const upper = el.type === 'scene_heading' || el.type === 'character' || el.type === 'transition' || el.type === 'shot';
    const text = upper ? el.text.toUpperCase() : el.text;
    return screenplaySchema.nodes[el.type].create(el.attrs || {}, text ? screenplaySchema.text(text) : undefined);
  });
  const doc = nodes.length ? screenplaySchema.nodes.doc.create({}, nodes) : emptyDoc();
  doc.check();
  return { doc, ...meta };
}

/** WebKit's ReadableStream cannot be iterated with `for await`, which pdf.js relies on. */
function polyfillStreamIteration(): void {
  const proto = (globalThis as any).ReadableStream?.prototype;
  if (!proto || Symbol.asyncIterator in proto) return;
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

/** Browser entry point: load pdf.js, extract, classify. */
export async function importPdf(data: ArrayBuffer): Promise<PdfImport> {
  polyfillStreamIteration();
  // Loaded on demand so pdf.js stays out of the main bundle. The legacy build
  // is used because the modern one needs stream async-iteration that WebKit lacks.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  (pdfjs as any).GlobalWorkerOptions.workerSrc = worker.default;
  const lines = await extractPdfLines(data, pdfjs);
  return pdfLinesToScript(lines);
}
