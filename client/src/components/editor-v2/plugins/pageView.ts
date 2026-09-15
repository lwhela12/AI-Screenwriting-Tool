import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { layoutElements, Layout, LayoutElementType, PAGE, COLUMNS, pageAt, wrapElement } from '../pagination/layout';
import { WrappedLine } from '../pagination/wrap';

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

const wrapCache = new WeakMap<PMNode, WrappedLine[]>();

export function layoutDoc(doc: PMNode): { layout: Layout; positions: number[] } {
  const nodes: PMNode[] = [];
  const positions: number[] = [];
  doc.forEach((node, offset) => {
    nodes.push(node);
    positions.push(offset);
  });
  const layout = layoutElements(
    nodes.map(node => ({ type: node.type.name as LayoutElementType, text: node.textContent })),
    {
      wrap: (el, index) => {
        const node = nodes[index];
        let lines = wrapCache.get(node);
        if (!lines) {
          lines = wrapElement(el);
          wrapCache.set(node, lines);
        }
        return lines;
      }
    }
  );
  return { layout, positions };
}

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
  gap.style.setProperty('--indent', `${opts.indentCh}ch`);
  gap.style.setProperty('--fill', `${opts.fillLines * PAGE.linePt}pt`);

  if (opts.more) gap.appendChild(div('page-gap-more', '(MORE)'));
  gap.appendChild(div('page-gap-fill'));
  gap.appendChild(div('page-gap-margin-bottom'));
  gap.appendChild(div('page-gap-band'));
  const top = div('page-gap-margin-top');
  top.appendChild(div('page-gap-number', `${opts.page}.`));
  gap.appendChild(top);
  if (opts.contd) gap.appendChild(div('page-gap-contd', opts.contd));
  return gap;
}

function buildState(doc: PMNode): PageViewState {
  const { layout, positions } = layoutDoc(doc);
  const decorations: Decoration[] = [];

  layout.elements.forEach((el, index) => {
    if (el.type === 'page_break') return;
    if (!el.spacerBefore) {
      const from = positions[index];
      decorations.push(Decoration.node(from, from + doc.child(index).nodeSize, { class: 'no-spacer' }));
    }
  });

  for (const brk of layout.breaks) {
    const el = layout.elements[brk.elementIndex];
    const inline = brk.lineIndex > 0;
    const pos = inline ? positions[brk.elementIndex] + 1 + el.lines[brk.lineIndex].start : positions[brk.elementIndex];
    const fillLines = Math.max(0, PAGE.linesPerPage - brk.rowsBefore);
    const indentCh = inline ? COLUMNS[el.type].indent : 0;
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
