import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';

/**
 * Focus mode: the scene being written stays lit, from its heading to the
 * element before the next heading; everything else fades back (but stays
 * readable). Before the first heading, the opening material is the scene.
 */

export interface FocusState {
  enabled: boolean;
  decorations: DecorationSet;
}

export const focusKey = new PluginKey<FocusState>('focus');

function litRange(doc: PMNode, index: number): [number, number] {
  let from = index;
  while (from > 0 && doc.child(from).type.name !== 'scene_heading') from--;
  let to = index;
  while (to + 1 < doc.childCount && doc.child(to + 1).type.name !== 'scene_heading') to++;
  return [from, to];
}

function build(doc: PMNode, selectionFrom: number): DecorationSet {
  const $pos = doc.resolve(Math.min(selectionFrom, doc.content.size));
  const current = $pos.depth >= 1 ? $pos.index(0) : 0;
  const [from, to] = litRange(doc, current);
  const decorations: Decoration[] = [];
  doc.forEach((node, offset, index) => {
    if (index >= from && index <= to) return;
    decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'focus-dim' }));
  });
  return DecorationSet.create(doc, decorations);
}

export function focusPlugin(): Plugin<FocusState> {
  return new Plugin<FocusState>({
    key: focusKey,
    state: {
      init: () => ({ enabled: false, decorations: DecorationSet.empty }),
      apply(tr, state, _old, newState) {
        const meta = tr.getMeta(focusKey) as { enabled: boolean } | undefined;
        const enabled = meta ? meta.enabled : state.enabled;
        if (!enabled) return { enabled: false, decorations: DecorationSet.empty };
        if (meta || tr.docChanged || tr.selectionSet) {
          return { enabled: true, decorations: build(newState.doc, newState.selection.from) };
        }
        return state;
      }
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations;
      }
    }
  });
}
