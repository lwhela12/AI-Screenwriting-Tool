import { Node as PMNode } from 'prosemirror-model';
import { screenplaySchema, emptyDoc, ElementType, isElementType, UPPERCASE_ELEMENTS } from './schema/screenplaySchema';
import { ScreenplayParser } from '../../utils/screenplayParser';
import type { ScreenplayElement } from '../../utils/screenplayPDF';
import { continuedCues, cueDisplayText } from './continued';

/**
 * Conversions between the three representations of a script:
 *
 *  - stored content: a string in the database. Newer scripts are ProseMirror
 *    JSON; scripts written with the original CodeMirror editor are plain text.
 *  - editor document: a ProseMirror node built from `screenplaySchema`.
 *  - export elements: the flat `{type, text}` list consumed by the exporters.
 */

const ELEMENT_TO_EXPORT: Record<ElementType, ScreenplayElement['type']> = {
  scene_heading: 'scene-heading',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  shot: 'scene-heading',
  centered: 'action'
};

const EXPORT_TO_ELEMENT: Record<ScreenplayElement['type'], ElementType> = {
  'scene-heading': 'scene_heading',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition'
};

function looksLikeJSON(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('{');
}

/** Unwrap the legacy `doc > page > element` structure into a flat element list. */
function flattenLegacyJSON(json: any): any {
  if (!json || json.type !== 'doc' || !Array.isArray(json.content)) return json;
  const content: any[] = [];
  for (const child of json.content) {
    if (child && child.type === 'page' && Array.isArray(child.content)) {
      content.push(...child.content);
    } else {
      content.push(child);
    }
  }
  return { ...json, content };
}

/** Build an editor document from a list of export elements. */
export function elementsToDoc(elements: ScreenplayElement[]): PMNode {
  const nodes: PMNode[] = [];
  for (const el of elements) {
    const typeName = EXPORT_TO_ELEMENT[el.type] || 'action';
    const nodeType = screenplaySchema.nodes[typeName];
    const text = UPPERCASE_ELEMENTS.has(typeName) ? el.text.toUpperCase() : el.text;
    nodes.push(nodeType.create({}, text ? screenplaySchema.text(text) : undefined));
  }
  if (nodes.length === 0) return emptyDoc();
  return screenplaySchema.nodes.doc.create({}, nodes);
}

/** Parse plain text (the legacy storage format, or a pasted script) into a document. */
export function textToDoc(text: string): PMNode {
  if (!text.trim()) return emptyDoc();
  return elementsToDoc(ScreenplayParser.parse(text));
}

/**
 * Build an editor document from whatever is stored for a project.
 * Never throws: unparseable content becomes a single action element so the
 * writer can still see and recover their text.
 */
export function contentToDoc(content: string | null | undefined): PMNode {
  if (!content || !content.trim()) return emptyDoc();

  if (looksLikeJSON(content)) {
    try {
      const json = flattenLegacyJSON(JSON.parse(content));
      const doc = screenplaySchema.nodeFromJSON(json);
      doc.check();
      return doc;
    } catch (err) {
      console.warn('Stored script JSON could not be parsed; falling back to text import.', err);
    }
  }

  return textToDoc(content);
}

/** Serialize an editor document for storage. */
export function docToContent(doc: PMNode): string {
  return JSON.stringify(doc.toJSON());
}

/** Convert an editor document to the flat element list used by exporters. */
export function docToElements(doc: PMNode): ScreenplayElement[] {
  const elements: ScreenplayElement[] = [];
  const continued = continuedCues(doc);
  doc.forEach((node, _offset, index) => {
    const name = node.type.name;
    if (!isElementType(name)) return; // page breaks and unknown nodes are skipped
    const text = name === 'character' ? cueDisplayText(node.textContent, continued.has(index)) : node.textContent;
    if (!text.trim()) return;
    elements.push({ type: ELEMENT_TO_EXPORT[name], text });
  });
  return elements;
}

/** Convert stored content (either format) directly to export elements. */
export function contentToElements(content: string | null | undefined): ScreenplayElement[] {
  return docToElements(contentToDoc(content));
}

/**
 * Render export elements as plain text with conventional screenplay
 * indentation, suitable for a .txt export or for pasting elsewhere.
 */
export function elementsToText(elements: ScreenplayElement[]): string {
  const indent: Record<ScreenplayElement['type'], number> = {
    'scene-heading': 0,
    action: 0,
    character: 22,
    parenthetical: 16,
    dialogue: 10,
    transition: 45
  };
  const lines: string[] = [];
  let prev: ScreenplayElement['type'] | null = null;
  for (const el of elements) {
    const tight = (el.type === 'dialogue' || el.type === 'parenthetical') && (prev === 'character' || prev === 'parenthetical' || prev === 'dialogue');
    if (lines.length > 0 && !tight) lines.push('');
    const pad = ' '.repeat(indent[el.type]);
    for (const line of el.text.split('\n')) lines.push(pad + line);
    prev = el.type;
  }
  return lines.join('\n') + '\n';
}
