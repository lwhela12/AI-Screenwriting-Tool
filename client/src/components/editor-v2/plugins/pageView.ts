import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { Layout, PAGE, CHAR_PT, pageAt, columnFor } from '../pagination/layout';
import { layoutFromDoc } from '../pagination/fromDoc';
import { CONTD } from '../continued';

/**
 * Renders the pagination engine's result inside the editor.
 *
 * Page breaks become non-editable "page gap" widgets placed exactly where
 * the engine breaks: before an element, or inside an element at the start
 * of the first line that moves to the next page. Each gap pads out the rest
 * of the old page, draws the bottom margin, the gap between sheets and the
 * top margin with the page number, and prints "(MORE)" / "NAME (CONT'D)"
 * when a speech is split. Spacing between elements is also driven by the
 * engine so that the screen never disagrees with the printed page.
 */

export interface PageViewState {
  layout: Layout;
  decorations: DecorationSet;
}

export const pageViewKey = new PluginKey<PageViewState>('pageView');

/** Kept for callers that imported the layout helper from here. */
export const layoutDoc = layoutFromDoc;

function div(className: string, text?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function pageGapElement(opts: { page: number; fillLines: number; more: boolean; contd: string | null; inline: boolean; indentCh: number }): HTMLElement {
  const gap = document.createElement(opts.inline ? 'span' : 'div');
  gap.className = 'page-gap' + (opts.inline ? ' page-gap-inline' : '');
  gap.contentEditable = 'false';
  gap.style.setProperty('--indent', `${opts.indentCh * CHAR_PT}pt`);
  gap.style.setProperty('--fill', `${opts.fillLines * PAGE.linePt}pt`);

  gap.appendChild(div('page-gap-fill'));
  const bottom = div('page-gap-margin-bottom');
  if (opts.more) bottom.appendChild(div('page-gap-more', '(MORE)')); // printed in the margin, as Final Draft does
  gap.appendChild(bottom);
  gap.appendChild(div('page-gap-band'));
  const top = div('page-gap-margin-top');
  top.appendChild(div('page-gap-number', `${opts.page}.`));
  if (opts.contd) top.appendChild(div('page-gap-contd', opts.contd)); // last row of the top margin
  gap.appendChild(top);
  return gap;
}

function contdWidget(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'auto-contd';
  span.contentEditable = 'false';
  span.textContent = ` ${CONTD}`;
  return span;
}

function buildState(doc: PMNode): PageViewState {
  const { layout, positions, continued } = layoutDoc(doc);
  const decorations: Decoration[] = [];

  continued.forEach(index => {
    const node = doc.child(index);
    const end = positions[index] + 1 + node.content.size;
    decorations.push(Decoration.widget(end, contdWidget, { side: 1, key: 'contd', ignoreSelection: true }));
  });

  layout.elements.forEach((el, index) => {
    if (el.type === 'page_break') return;
    const from = positions[index];
    const to = from + doc.child(index).nodeSize;
    if (!el.spacerBefore) {
      decorations.push(Decoration.node(from, to, { class: 'no-spacer' }));
    } else if (el.spacerRows > 1) {
      decorations.push(Decoration.node(from, to, { style: `margin-top:${el.spacerRows * PAGE.linePt}pt` }));
    }
  });

  // Dual dialogue: the right speech is pulled up beside the left one, and the
  // block's last element pushes what follows below the taller column.
  for (const block of layout.duals) {
    const nodeDeco = (index: number, attrs: Record<string, string>) => {
      const from = positions[index];
      decorations.push(Decoration.node(from, from + doc.child(index).nodeSize, attrs));
    };
    block.left.forEach(i => nodeDeco(i, { class: 'dual dual-left' }));
    block.right.forEach((i, k) => {
      const attrs: Record<string, string> = { class: 'dual dual-right' };
      if (k === 0) attrs.style = `margin-top:-${block.leftRows * PAGE.linePt}pt`;
      if (k === block.right.length - 1 && block.leftRows > block.rightRows) {
        attrs.style = (attrs.style ? attrs.style + ';' : '') + `margin-bottom:${(block.leftRows - block.rightRows) * PAGE.linePt}pt`;
      }
      nodeDeco(i, attrs);
    });
  }

  for (const brk of layout.breaks) {
    const el = layout.elements[brk.elementIndex];
    const inline = brk.lineIndex > 0;
    const pos = inline ? positions[brk.elementIndex] + 1 + el.lines[brk.lineIndex].start : positions[brk.elementIndex];
    const fillLines = Math.max(0, PAGE.linesPerPage - brk.rowsBefore);
    const indentCh = inline ? columnFor(el.type, el.dualSide).indent : 0;
    const key = `gap-${brk.page}-${fillLines}-${brk.more ? 'm' : ''}-${brk.contdCue || ''}-${inline ? el.type : 'block'}`;
    decorations.push(
      Decoration.widget(pos, () => pageGapElement({ page: brk.page, fillLines, more: brk.more, contd: brk.contdCue, inline, indentCh }), {
        side: -1,
        key,
        ignoreSelection: true
      })
    );
  }

  return { layout, decorations: DecorationSet.create(doc, decorations) };
}

/** Page and page count for the current selection. */
export function pageStatus(state: EditorState): { page: number; pageCount: number } {
  const pv = pageViewKey.getState(state);
  if (!pv) return { page: 1, pageCount: 1 };
  const { $from } = state.selection;
  const elementIndex = $from.depth >= 1 ? $from.index(0) : 0;
  const offset = $from.depth >= 1 ? $from.parentOffset : 0;
  return { page: pageAt(pv.layout, elementIndex, offset), pageCount: pv.layout.pages.length };
}

function padLastPage(view: EditorView) {
  const pv = pageViewKey.getState(view.state);
  if (!pv) return;
  const lastRows = pv.layout.pages[pv.layout.pages.length - 1].rows.length;
  const fillPt = Math.max(0, PAGE.linesPerPage - lastRows) * PAGE.linePt;
  view.dom.style.paddingBottom = `calc(${PAGE.bottomMarginIn}in + ${fillPt}pt)`;
}

export const pageViewPlugin = new Plugin<PageViewState>({
  key: pageViewKey,
  state: {
    init(_config, state) {
      return buildState(state.doc);
    },
    apply(tr, value) {
      return tr.docChanged ? buildState(tr.doc) : value;
    }
  },
  props: {
    decorations(state) {
      return this.getState(state)?.decorations;
    }
  },
  view(view) {
    padLastPage(view);
    return {
      update(v, prev) {
        if (v.state.doc !== prev.doc) padLastPage(v);
      }
    };
  }
});
