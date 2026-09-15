import { Node as PMNode, Mark } from 'prosemirror-model';
import { screenplaySchema, ElementType, emptyDoc, isElementType } from '../components/editor-v2/schema/screenplaySchema';

/**
 * Fountain import and export (fountain.io).
 *
 * Fountain is the plain-text screenplay format used by Highland, Slugline,
 * Beat, Writer Duet and many others. Import understands the full syntax
 * that maps onto our document: title page, scene headings (with forced "."
 * and "#numbers#"), action (forced "!"), characters (forced "@", dual "^"),
 * parentheticals, dialogue, lyrics, transitions (forced ">"), centered
 * text, page breaks, sections ("#" become structure labels), synopses ("="
 * become scene synopses), notes, boneyards and *emphasis*.
 */

export interface FountainImport {
  doc: PMNode;
  title?: string;
  author?: string;
  contact?: string;
}

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i;
const TRANSITION_RE = /^[A-Z0-9 .,'-]*TO:$/;

function isUpper(line: string): boolean {
  return line === line.toUpperCase() && /[A-Z]/.test(line);
}

/** Parse *italic*, **bold**, _underline_ into text nodes with marks. */
function inline(text: string): PMNode[] {
  const nodes: PMNode[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const marks: Mark[] = [];
    if (bold) marks.push(screenplaySchema.marks.bold.create());
    if (italic) marks.push(screenplaySchema.marks.italic.create());
    if (underline) marks.push(screenplaySchema.marks.underline.create());
    nodes.push(screenplaySchema.text(buf, marks));
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && '*_'.includes(text[i + 1])) {
      buf += text[i + 1];
      i++;
      continue;
    }
    if (text.startsWith('***', i)) {
      flush();
      bold = !bold;
      italic = !italic;
      i += 2;
      continue;
    }
    if (text.startsWith('**', i)) {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }
    if (ch === '*') {
      flush();
      italic = !italic;
      continue;
    }
    if (ch === '_') {
      flush();
      underline = !underline;
      continue;
    }
    buf += ch;
  }
  flush();
  return nodes;
}

function stripNotes(text: string): string {
  return text.replace(/\[\[[\s\S]*?\]\]/g, '');
}

interface Pending {
  type: ElementType;
  text: string;
  attrs?: Record<string, any>;
}

export function parseFountain(source: string): FountainImport {
  let text = source.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ''); // boneyard
  const lines = text.split('\n');
  let i = 0;

  // Title page: "Key: value" lines (values may continue on indented lines) up to the first blank line.
  const meta: Record<string, string> = {};
  if (/^[A-Za-z][A-Za-z ]*:/.test(lines[0] || '')) {
    let key = '';
    while (i < lines.length && lines[i].trim() !== '') {
      const m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(lines[i]);
      if (m && !/^\s/.test(lines[i])) {
        key = m[1].trim().toLowerCase();
        meta[key] = m[2].trim();
      } else if (key) {
        meta[key] = (meta[key] ? meta[key] + '\n' : '') + lines[i].trim();
      }
      i++;
    }
  }

  const elements: Pending[] = [];
  let pendingStructure: string | null = null;
  const ref: { lastHeading: Pending | null } = { lastHeading: null }; // object so closure writes are visible to the type checker
  let inDialogue = false;
  let lastCue: Pending | null = null;

  const push = (el: Pending) => {
    elements.push(el);
    if (el.type === 'scene_heading') ref.lastHeading = el;
  };

  const blankBefore = (k: number) => k === 0 || lines[k - 1].trim() === '';
  const nextNonBlank = (k: number) => k + 1 < lines.length && lines[k + 1].trim() !== '';

  for (; i < lines.length; i++) {
    const raw = stripNotes(lines[i]);
    const line = raw.trim();

    if (line === '') {
      inDialogue = false;
      continue;
    }

    if (/^={3,}$/.test(line)) {
      push({ type: 'page_break' as ElementType, text: '' });
      inDialogue = false;
      continue;
    }

    if (line.startsWith('#') && !line.startsWith('#!')) {
      pendingStructure = line.replace(/^#+\s*/, '').trim() || null;
      inDialogue = false;
      continue;
    }

    if (line.startsWith('=') && !/^={3,}$/.test(line)) {
      const synopsis = line.slice(1).trim();
      const heading = ref.lastHeading;
      if (heading && synopsis) {
        const existing = heading.attrs?.synopsis;
        heading.attrs = { ...(heading.attrs || {}), synopsis: existing ? `${existing}\n${synopsis}` : synopsis };
      }
      continue;
    }

    if (inDialogue) {
      if (line.startsWith('(') && line.endsWith(')')) {
        push({ type: 'parenthetical', text: line });
        continue;
      }
      const lyric = line.startsWith('~') ? line.slice(1).trim() : line;
      const last = elements[elements.length - 1];
      if (last && last.type === 'dialogue') last.text += '\n' + lyric;
      else push({ type: 'dialogue', text: lyric });
      continue;
    }

    // Forced elements.
    if (line.startsWith('!')) {
      push({ type: 'action', text: line.slice(1) });
      continue;
    }
    if (line.startsWith('@')) {
      const cue = line.slice(1).trim();
      const dual = cue.endsWith('^');
      lastCue = { type: 'character', text: dual ? cue.slice(0, -1).trim().toUpperCase() : cue.toUpperCase(), attrs: {} };
      if (dual && lastCue) markDual(elements, lastCue);
      push(lastCue);
      inDialogue = true;
      continue;
    }
    if (line.startsWith('.') && !line.startsWith('..')) {
      push(headingElement(line.slice(1).trim(), pendingStructure));
      pendingStructure = null;
      continue;
    }
    if (line.startsWith('>') && line.endsWith('<')) {
      push({ type: 'centered', text: line.slice(1, -1).trim() });
      continue;
    }
    if (line.startsWith('>')) {
      push({ type: 'transition', text: line.slice(1).trim().toUpperCase() });
      continue;
    }

    if (SCENE_RE.test(line) && blankBefore(i)) {
      push(headingElement(line, pendingStructure));
      pendingStructure = null;
      continue;
    }

    if (isUpper(line) && TRANSITION_RE.test(line) && blankBefore(i) && !nextNonBlank(i)) {
      push({ type: 'transition', text: line });
      continue;
    }

    if (isUpper(line.replace(/\(.*?\)/g, '')) && blankBefore(i) && nextNonBlank(i) && !/^[\d\s.]+$/.test(line)) {
      const dual = line.endsWith('^');
      const cue = dual ? line.slice(0, -1).trim() : line;
      lastCue = { type: 'character', text: cue, attrs: {} };
      if (dual) markDual(elements, lastCue);
      push(lastCue);
      inDialogue = true;
      continue;
    }

    // Action: consecutive lines form one paragraph with hard line breaks.
    const last = elements[elements.length - 1];
    if (last && last.type === 'action' && !blankBefore(i)) last.text += '\n' + raw.replace(/^\s+/, '');
    else push({ type: 'action', text: raw.trimStart() });
  }

  const nodes: PMNode[] = elements.map(el => {
    if (el.type === ('page_break' as ElementType)) return screenplaySchema.nodes.page_break.create();
    const type = isElementType(el.type) ? el.type : 'action';
    const content = inline(el.text);
    return screenplaySchema.nodes[type].create(el.attrs || {}, content);
  });

  const doc = nodes.length ? screenplaySchema.nodes.doc.create({}, nodes) : emptyDoc();
  doc.check();

  const author = meta['author'] || meta['authors'] || meta['written by'];
  return { doc, title: meta['title'], author, contact: meta['contact'] };
}

function headingElement(text: string, structure: string | null): Pending {
  const m = /^(.*?)\s*#([^#]+)#\s*$/.exec(text);
  const attrs: Record<string, any> = {};
  if (m) attrs.number = m[2].trim();
  if (structure) attrs.structure = structure;
  return { type: 'scene_heading', text: (m ? m[1] : text).trim().toUpperCase(), attrs };
}

/** "^" marks the second speech of a dual-dialogue pair: tag it right and the previous cue left. */
function markDual(elements: Pending[], cue: Pending) {
  cue.attrs = { ...(cue.attrs || {}), dual: 'right' };
  for (let k = elements.length - 1; k >= 0; k--) {
    if (elements[k].type === 'character') {
      elements[k].attrs = { ...(elements[k].attrs || {}), dual: 'left' };
      break;
    }
    if (elements[k].type !== 'dialogue' && elements[k].type !== 'parenthetical') break;
  }
}

function escapeFountain(text: string): string {
  return text.replace(/([*_])/g, '\\$1');
}

function runsToFountain(node: PMNode): string {
  let out = '';
  node.forEach(child => {
    if (!child.isText) return;
    const names = child.marks.map(m => m.type.name);
    let t = escapeFountain(child.text || '');
    if (names.includes('underline')) t = `_${t}_`;
    if (names.includes('bold') && names.includes('italic')) t = `***${t}***`;
    else if (names.includes('bold')) t = `**${t}**`;
    else if (names.includes('italic')) t = `*${t}*`;
    out += t;
  });
  return out;
}

export function docToFountain(doc: PMNode, meta: { title?: string; author?: string; contact?: string } = {}): string {
  const head: string[] = [];
  if (meta.title) head.push(`Title: ${meta.title}`);
  if (meta.author) head.push(`Author: ${meta.author}`);
  if (meta.contact) head.push('Contact:\n' + meta.contact.split('\n').map(l => `    ${l}`).join('\n'));

  const out: string[] = [];
  let prev: string | null = null;
  doc.forEach(node => {
    const type = node.type.name;
    const text = runsToFountain(node);
    const tight = (type === 'dialogue' || type === 'parenthetical') && (prev === 'character' || prev === 'parenthetical' || prev === 'dialogue');
    if (out.length && !tight) out.push('');
    switch (type) {
      case 'scene_heading': {
        if (node.attrs.structure) out.push(`# ${node.attrs.structure}`, '');
        const forced = SCENE_RE.test(text) ? '' : '.';
        out.push(`${forced}${text}${node.attrs.number ? ` #${node.attrs.number}#` : ''}`);
        if (node.attrs.synopsis) String(node.attrs.synopsis).split('\n').forEach(l => out.push(`= ${l}`));
        break;
      }
      case 'action':
        out.push(isUpper(text) && text.trim() && !text.includes('\n') ? `!${text}` : text);
        break;
      case 'character':
        out.push(`${isUpper(text) ? '' : '@'}${text}${node.attrs.dual === 'right' ? ' ^' : ''}`);
        break;
      case 'parenthetical':
      case 'dialogue':
        out.push(text);
        break;
      case 'transition':
        out.push(TRANSITION_RE.test(text) ? text : `> ${text}`);
        break;
      case 'centered':
        out.push(`> ${text} <`);
        break;
      case 'shot':
        out.push(`!${text}`);
        break;
      case 'page_break':
        out.push('===');
        break;
    }
    prev = type;
  });

  return (head.length ? head.join('\n') + '\n\n' : '') + out.join('\n') + '\n';
}
