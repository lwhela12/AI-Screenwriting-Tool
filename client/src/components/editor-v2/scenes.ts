import { Node as PMNode, Fragment } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { screenplaySchema } from './schema/screenplaySchema';
import { Layout, PAGE } from './pagination/layout';
import { speakerName } from './continued';

/**
 * The scene model: the script seen as a list of scenes, derived from the
 * document on demand. A scene runs from a scene heading to the element
 * before the next one. Synopsis, colour and structure label live on the
 * heading node so they travel with the scene and export to Final Draft.
 */

export interface SceneInfo {
  /** Position of the scene in the list (0-based). */
  ordinal: number;
  /** Document child index of the heading (-1 for material before the first heading). */
  index: number;
  /** Document position of the first node of the scene. */
  from: number;
  /** Document position just after the last node of the scene. */
  to: number;
  heading: string;
  number: string | null;
  synopsis: string;
  color: string | null;
  structure: string | null;
  /** Page on which the scene starts (1 when no layout is given). */
  page: number;
  /** Length in eighths of a page (0 when no layout is given). */
  eighths: number;
  characters: string[];
  /** First line of action in the scene, for previews. */
  preview: string;
  /** True for the pseudo-scene holding elements before the first heading. */
  opening: boolean;
}

export function scenesOf(doc: PMNode, layout?: Layout): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  let current: SceneInfo | null = null;
  let rows = 0;
  const finish = () => {
    if (!current) return;
    current.eighths = layout ? Math.round((rows / PAGE.linesPerPage) * 8) : 0;
    scenes.push(current);
  };

  doc.forEach((node, offset, index) => {
    const el = layout?.elements[index];
    if (node.type.name === 'scene_heading') {
      finish();
      rows = 0;
      current = {
        ordinal: scenes.length,
        index,
        from: offset,
        to: offset + node.nodeSize,
        heading: node.textContent,
        number: node.attrs.number || null,
        synopsis: node.attrs.synopsis || '',
        color: node.attrs.color || null,
        structure: node.attrs.structure || null,
        page: el ? el.page : 1,
        eighths: 0,
        characters: [],
        preview: '',
        opening: false
      };
    } else if (!current) {
      current = {
        ordinal: 0,
        index: -1,
        from: offset,
        to: offset + node.nodeSize,
        heading: '',
        number: null,
        synopsis: '',
        color: null,
        structure: null,
        page: el ? el.page : 1,
        eighths: 0,
        characters: [],
        preview: '',
        opening: true
      };
    }
    if (!current) return;
    current.to = offset + node.nodeSize;
    if (el) rows += el.lines.length + (el.spacerBefore ? el.spacerRows : 0);
    if (node.type.name === 'character') {
      const name = speakerName(node.textContent);
      if (name && !current.characters.includes(name)) current.characters.push(name);
    }
    if (node.type.name === 'action' && !current.preview && node.textContent.trim()) {
      current.preview = node.textContent.trim();
    }
  });
  finish();
  return scenes;
}

function headingPos(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/** Update attributes (synopsis, color, structure, number) of the scene heading at child `index`. */
export function setSceneAttrs(view: EditorView, index: number, attrs: Partial<{ synopsis: string | null; color: string | null; structure: string | null; number: string | null }>): void {
  const doc = view.state.doc;
  if (index < 0 || index >= doc.childCount) return;
  const node = doc.child(index);
  if (node.type.name !== 'scene_heading') return;
  const pos = headingPos(doc, index);
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

/** Replace the text of the scene heading at child `index` (kept upper case). */
export function setSceneHeading(view: EditorView, index: number, text: string): void {
  const doc = view.state.doc;
  if (index < 0 || index >= doc.childCount) return;
  const node = doc.child(index);
  if (node.type.name !== 'scene_heading') return;
  const pos = headingPos(doc, index);
  const upper = text.toUpperCase();
  const tr = view.state.tr.replaceWith(pos + 1, pos + 1 + node.content.size, upper ? screenplaySchema.text(upper) : []);
  view.dispatch(tr);
}

/** Delete a whole scene (heading and everything up to the next heading). */
export function deleteScene(view: EditorView, ordinal: number): void {
  const scenes = scenesOf(view.state.doc);
  const scene = scenes[ordinal];
  if (!scene || scene.opening) return;
  const tr = view.state.tr.delete(scene.from, scene.to);
  // Deleting everything leaves one empty block; make sure it is an action element.
  if (tr.doc.childCount === 1 && tr.doc.firstChild!.content.size === 0 && tr.doc.firstChild!.type.name !== 'action') {
    tr.setNodeMarkup(0, screenplaySchema.nodes.action);
  }
  view.dispatch(tr);
}

/**
 * Move a scene so that it sits at `toOrdinal` in the scene list. Returns the
 * transaction, or null when nothing needs to change. The opening material
 * before the first heading never moves.
 */
export function moveSceneTransaction(state: EditorState, fromOrdinal: number, toOrdinal: number): Transaction | null {
  const scenes = scenesOf(state.doc);
  const from = scenes[fromOrdinal];
  const to = scenes[toOrdinal];
  if (!from || !to || from.opening || to.opening || fromOrdinal === toOrdinal) return null;

  const content: Fragment = state.doc.slice(from.from, from.to).content;
  const tr = state.tr;
  tr.delete(from.from, from.to);
  // Moving down: land after the target scene; moving up: land before it.
  const target = toOrdinal > fromOrdinal ? to.to : to.from;
  const insertAt = tr.mapping.map(target, toOrdinal > fromOrdinal ? -1 : 1);
  tr.insert(insertAt, content);
  tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
  return tr.scrollIntoView();
}

export function moveScene(view: EditorView, fromOrdinal: number, toOrdinal: number): boolean {
  const tr = moveSceneTransaction(view.state, fromOrdinal, toOrdinal);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}

/** Insert a new scene (heading plus an empty action) after scene `afterOrdinal`, or at the end when null. */
export function insertScene(view: EditorView, afterOrdinal: number | null, heading = '', synopsis = ''): void {
  const { state } = view;
  const scenes = scenesOf(state.doc);
  const after = afterOrdinal === null ? null : scenes[afterOrdinal];
  const pos = after ? after.to : state.doc.content.size;
  const headingNode = screenplaySchema.nodes.scene_heading.create(
    { synopsis: synopsis || null },
    heading ? screenplaySchema.text(heading.toUpperCase()) : undefined
  );
  const action = screenplaySchema.nodes.action.create();
  const tr = state.tr.insert(pos, [headingNode, action]);
  tr.setSelection(TextSelection.create(tr.doc, pos + 1 + headingNode.content.size));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/** Put the cursor at the start of a scene and scroll it into view. */
export function jumpToScene(view: EditorView, scene: SceneInfo): void {
  const pos = Math.min(scene.from + 1, view.state.doc.content.size);
  // ProseMirror only scrolls to the selection when the editor owns it, and a
  // click in a sidebar has just taken focus away: take it back, move the
  // cursor, then scroll the scene's first element near the top ourselves.
  view.focus();
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  scrollSceneToTop(view, scene);
}

function scrollSceneToTop(view: EditorView, scene: SceneInfo): void {
  const target = view.nodeDOM(scene.from) as HTMLElement | null;
  if (!target || typeof target.getBoundingClientRect !== 'function') return;
  const container = view.dom.closest('.editor-scroll-container') as HTMLElement | null;
  if (container) {
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTop = Math.max(0, top - 48);
  } else if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'start' });
  }
}

/** Scene containing document position `pos`, or null. */
export function sceneAt(scenes: SceneInfo[], pos: number): SceneInfo | null {
  for (const s of scenes) if (pos >= s.from && pos < s.to) return s;
  return scenes.length ? scenes[scenes.length - 1] : null;
}
