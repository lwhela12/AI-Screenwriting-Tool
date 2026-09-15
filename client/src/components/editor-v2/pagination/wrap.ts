/**
 * Deterministic word wrap on a monospace character grid.
 *
 * Screenplays are set in 12pt Courier at 10 characters per inch, so a line's
 * width is simply its character count. The editor lays elements out on the
 * same grid (`ch` units) so that the browser and this function agree about
 * where lines break; the PDF exporter prints these lines verbatim.
 *
 * Break opportunities mirror the browser's: after a run of spaces, and after
 * a hyphen that is not followed by a digit. Trailing spaces hang past the
 * margin exactly as `white-space: pre-wrap` renders them. A word longer than
 * the line is broken at the margin (`overflow-wrap: break-word`).
 */

export interface WrappedLine {
  /** The line as printed, without trailing spaces. */
  text: string;
  /** Offset of the first character of this line within the element text. */
  start: number;
  /** Offset just past the last character (including hanging spaces). */
  end: number;
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

function isBreakOpportunity(text: string, p: number): boolean {
  const prev = text[p - 1];
  const next = text[p];
  if (next === '\n') return false;
  if (isSpace(prev) && !isSpace(next)) return true;
  if (prev === '-' && !isSpace(next) && !/\d/.test(next) && next !== '-') return true;
  return false;
}

function visibleWidth(text: string, from: number, to: number): number {
  let end = to;
  while (end > from && isSpace(text[end - 1])) end--;
  return end - from;
}

function wrapParagraph(text: string, width: number, base: number): WrappedLine[] {
  const lines: WrappedLine[] = [];
  const n = text.length;
  if (n === 0) return [{ text: '', start: base, end: base }];

  let lineStart = 0;
  while (lineStart < n) {
    let best = -1;
    for (let p = lineStart + 1; p <= n; p++) {
      if (p !== n && !isBreakOpportunity(text, p)) continue;
      if (visibleWidth(text, lineStart, p) <= width) best = p;
      else break;
    }
    if (best === -1) {
      // The first word is wider than the line: break it at the margin.
      best = Math.min(n, lineStart + Math.max(1, width));
    }
    lines.push({
      text: text.slice(lineStart, best).replace(/[ \t]+$/, ''),
      start: base + lineStart,
      end: base + best
    });
    lineStart = best;
  }
  return lines;
}

/** Wrap `text` to `width` characters. Hard line breaks (`\n`) always start a new line. */
export function wrapText(text: string, width: number): WrappedLine[] {
  const out: WrappedLine[] = [];
  let offset = 0;
  const paragraphs = text.split('\n');
  paragraphs.forEach((para, i) => {
    out.push(...wrapParagraph(para, width, offset));
    offset += para.length + (i < paragraphs.length - 1 ? 1 : 0);
  });
  return out;
}
