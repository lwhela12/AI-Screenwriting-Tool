import { Node as PMNode } from 'prosemirror-model';
import { layoutElements, Layout, LayoutElementType, wrapElement } from './layout';
import { WrappedLine } from './wrap';
import { continuedCues, cueDisplayText } from '../continued';

/**
 * Lay out an editor document. Pure (no DOM), so the PDF exporter and the
 * editor share it. Wrapped lines are cached per document node; ProseMirror
 * nodes are immutable, so an unchanged node keeps its lines across edits.
 */

const wrapCache = new WeakMap<PMNode, WrappedLine[]>();

export interface DocLayout {
  layout: Layout;
  /** Document position of each top-level element. */
  positions: number[];
  /** Indices of character cues that get an automatic "(CONT'D)". */
  continued: Set<number>;
}

export function layoutFromDoc(doc: PMNode): DocLayout {
  const nodes: PMNode[] = [];
  const positions: number[] = [];
  doc.forEach((node, offset) => {
    nodes.push(node);
    positions.push(offset);
  });
  const continued = continuedCues(doc);
  const layout = layoutElements(
    nodes.map((node, index) => ({
      type: node.type.name as LayoutElementType,
      text: node.type.name === 'character' ? cueDisplayText(node.textContent, continued.has(index)) : node.textContent,
      dual: node.type.name === 'character' ? node.attrs.dual || null : null
    })),
    {
      wrap: (el, index) => {
        const node = nodes[index];
        if (continued.has(index)) return wrapElement(el); // text differs from the node's; skip the cache
        let lines = wrapCache.get(node);
        if (!lines) {
          lines = wrapElement(el);
          wrapCache.set(node, lines);
        }
        return lines;
      }
    }
  );
  return { layout, positions, continued };
}
