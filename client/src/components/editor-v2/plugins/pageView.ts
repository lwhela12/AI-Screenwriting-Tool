import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';

/**
 * Estimated pagination.
 *
 * This is a line-count model of a US Letter screenplay page (55 lines of
 * 12pt Courier). It is good enough to show writers roughly where pages fall
 * while typing; it is not the industry-accurate pagination engine, which
 * must also handle MORE/CONT'D and orphan rules and will replace this.
 */

export const LINES_PER_PAGE = 55;

/** Characters per line for each element, derived from the standard margins. */
const LINE_WIDTH: Record<string, number> = {
  scene_heading: 61,
  action: 61,
  character: 38,
  parenthetical: 25,
  dialogue: 35,
  transition: 20,
  centered: 61
};

const DIALOGUE_GROUP = new Set(['character', 'parenthetical', 'dialogue']);

function wrappedLines(text: string, width: number): number {
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let current = 0;
    let count = 1;
    for (const word of words) {
      const needed = current === 0 ? word.length : current + 1 + word.length;
      if (needed > width && current > 0) {
        count += 1;
        current = word.length;
      } else {
        current = needed;
      }
    }
    lines += count;
  }
  return lines;
}

/** Lines occupied by `node`, including the blank line that separates it from the previous element. */
export function elementLines(node: PMNode, prevType: string | null): number {
  const type = node.type.name;
  if (type === 'page_break') return 0;
  const body = wrappedLines(node.textContent, LINE_WIDTH[type] || 61);
  const tight = DIALOGUE_GROUP.has(type) && prevType !== null && DIALOGUE_GROUP.has(prevType);
  const spacer = prevType === null || tight ? 0 : 1;
  return body + spacer;
}

export interface PageLayout {
  /** Document positions (before an element) where a new page starts. */
  breaks: number[];
  pageCount: number;
}

export function estimateLayout(doc: PMNode): PageLayout {
  const breaks: number[] = [];
  let linesOnPage = 0;
  let prevType: string | null = null;

  doc.forEach((node, offset) => {
    if (node.type.name === 'page_break') {
      breaks.push(offset + node.nodeSize);
      linesOnPage = 0;
      prevType = null;
      return;
    }
    const lines = elementLines(node, prevType);
    if (linesOnPage > 0 && linesOnPage + lines > LINES_PER_PAGE) {
      breaks.push(offset);
      linesOnPage = elementLines(node, null);
    } else {
      linesOnPage += lines;
    }
    prevType = node.type.name;
  });

  return { breaks, pageCount: breaks.length + 1 };
}

export const pageViewKey = new PluginKey<DecorationSet>('pageView');

function buildDecorations(doc: PMNode): DecorationSet {
  const { breaks } = estimateLayout(doc);
  const decorations = breaks.map((pos, index) =>
    Decoration.widget(
      pos,
      () => {
        const el = document.createElement('div');
        el.className = 'page-break-indicator';
        el.contentEditable = 'false';
        el.dataset.label = `Page ${index + 2}`;
        return el;
      },
      { side: -1, key: `page-${index}` }
    )
  );
  return DecorationSet.create(doc, decorations);
}

export const pageViewPlugin = new Plugin<DecorationSet>({
  key: pageViewKey,
  state: {
    init(_config, state) {
      return buildDecorations(state.doc);
    },
    apply(tr, decorations) {
      return tr.docChanged ? buildDecorations(tr.doc) : decorations;
    }
  },
  props: {
    decorations(state) {
      return this.getState(state);
    }
  }
});
