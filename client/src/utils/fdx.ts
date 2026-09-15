import { Node as PMNode, Mark } from 'prosemirror-model';
import { screenplaySchema, ElementType, emptyDoc, isElementType, UPPERCASE_ELEMENTS } from '../components/editor-v2/schema/screenplaySchema';
import { continuedCues, cueDisplayText, hasContd, stripContd } from '../components/editor-v2/continued';

/**
 * Final Draft (.fdx) import and export.
 *
 * FDX is XML: a `<Content>` of `<Paragraph Type="...">` elements, each made
 * of `<Text>` runs that may carry a Style (Bold, Italic, Underline). Scene
 * numbers live on the paragraph (`Number`), centered text uses
 * `Alignment="Center"`, a page break is `StartsNewPage="Yes"` on the
 * paragraph that opens the new page, and dual dialogue wraps two speeches
 * in `<DualDialogue>`. The title page is a second `<Content>` inside
 * `<TitlePage>`.
 */

export interface FDXImport {
  doc: PMNode;
  title?: string;
  author?: string;
  contact?: string;
}

const FDX_TO_ELEMENT: Record<string, ElementType> = {
  'Scene Heading': 'scene_heading',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
  General: 'action',
  'Cast List': 'action',
  'New Act': 'centered',
  'End of Act': 'centered'
};

const ELEMENT_TO_FDX: Record<ElementType, string> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  centered: 'Action'
};

function marksFor(style: string | null): Mark[] {
  if (!style) return [];
  const marks: Mark[] = [];
  const parts = style.split('+').map(s => s.trim());
  if (parts.includes('Bold')) marks.push(screenplaySchema.marks.bold.create());
  if (parts.includes('Italic')) marks.push(screenplaySchema.marks.italic.create());
  if (parts.includes('Underline')) marks.push(screenplaySchema.marks.underline.create());
  return marks;
}

/**
 * Inline content of a paragraph: one text node per <Text> run, styles as marks.
 * Final Draft stores cues and headings in the case they were typed and
 * capitalises them as formatting; we store them capitalised so that exports
 * and SmartType see what the writer sees.
 */
function inlineContent(paragraph: Element, uppercase = false): PMNode[] {
  const nodes: PMNode[] = [];
  for (const child of Array.from(paragraph.children)) {
    if (child.tagName !== 'Text') continue;
    const raw = child.textContent || '';
    if (!raw) continue;
    const text = uppercase ? raw.toUpperCase() : raw;
    nodes.push(screenplaySchema.text(text, marksFor(child.getAttribute('Style'))));
  }
  return nodes;
}

function paragraphToNode(paragraph: Element, dual: 'left' | 'right' | null): PMNode {
  const fdxType = paragraph.getAttribute('Type') || 'Action';
  let type: ElementType = FDX_TO_ELEMENT[fdxType] || 'action';
  if (type === 'action' && paragraph.getAttribute('Alignment') === 'Center') type = 'centered';

  const attrs: Record<string, any> = {};
  if (type === 'scene_heading') {
    attrs.number = paragraph.getAttribute('Number') || null;
    const props = Array.from(paragraph.children).find(c => c.tagName === 'SceneProperties');
    if (props) {
      const color = props.getAttribute('Color');
      if (color && !/^#F{12}$/i.test(color)) attrs.color = fdxColorToCss(color);
      const summary = Array.from(props.children).find(c => c.tagName === 'Summary');
      if (summary) {
        const lines: string[] = [];
        for (const p of Array.from(summary.children)) {
          if (p.tagName === 'Paragraph') lines.push(inlineContent(p).map(n => n.text || '').join(''));
        }
        const text = lines.join('\n').trim();
        if (text) attrs.synopsis = text;
      }
    }
  }
  if (type === 'character') attrs.dual = dual;

  let content = inlineContent(paragraph, UPPERCASE_ELEMENTS.has(type));
  if (type === 'character') {
    // Final Draft writes its automatic "(CONT'D)" into the text; we compute it instead.
    const full = content.map(n => n.text || '').join('');
    if (hasContd(full)) content = truncateRuns(content, stripContd(full).length);
  }
  return screenplaySchema.nodes[type].create(attrs, content);
}

/** Final Draft colours are 48-bit "#RRRRGGGGBBBB"; keep the high byte of each channel. */
function fdxColorToCss(color: string): string {
  const m = /^#([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})$/i.exec(color);
  if (!m) return color;
  return '#' + m.slice(1).map(c => c.slice(0, 2)).join('').toLowerCase();
}

function cssColorToFdx(color: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return color;
  return '#' + m.slice(1).map(c => (c + c).toUpperCase()).join('');
}

/** Keep only the first `length` characters of a run of text nodes, preserving marks. */
function truncateRuns(runs: PMNode[], length: number): PMNode[] {
  const out: PMNode[] = [];
  let remaining = length;
  for (const run of runs) {
    if (remaining <= 0) break;
    const text = run.text || '';
    const keep = text.slice(0, remaining);
    if (keep) out.push(screenplaySchema.text(keep, run.marks));
    remaining -= text.length;
  }
  return out;
}

function paragraphsOf(content: Element): PMNode[] {
  const nodes: PMNode[] = [];
  for (const child of Array.from(content.children)) {
    if (child.tagName === 'Paragraph') {
      if (child.getAttribute('StartsNewPage') === 'Yes' && nodes.length > 0) {
        nodes.push(screenplaySchema.nodes.page_break.create());
      }
      nodes.push(paragraphToNode(child, null));
    } else if (child.tagName === 'DualDialogue') {
      let cueIndex = 0;
      for (const p of Array.from(child.children)) {
        if (p.tagName !== 'Paragraph') continue;
        const isCue = p.getAttribute('Type') === 'Character';
        const side: 'left' | 'right' | null = isCue ? (cueIndex++ === 0 ? 'left' : 'right') : null;
        nodes.push(paragraphToNode(p, side));
      }
    }
  }
  return nodes;
}

function titlePageOf(root: Element): { title?: string; author?: string; contact?: string } {
  const titlePage = root.querySelector('TitlePage > Content');
  if (!titlePage) return {};
  const lines: string[] = [];
  for (const p of Array.from(titlePage.children)) {
    if (p.tagName !== 'Paragraph') continue;
    lines.push(inlineContent(p).map(n => n.text || '').join('').trim());
  }
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter(x => x.l);
  if (nonEmpty.length === 0) return {};

  const title = nonEmpty[0].l;
  let author: string | undefined;
  let authorLine = -1;
  for (let k = 1; k < nonEmpty.length; k++) {
    if (/^(written\s+)?by$/i.test(nonEmpty[k].l) && nonEmpty[k + 1]) {
      author = nonEmpty[k + 1].l;
      authorLine = nonEmpty[k + 1].i;
      break;
    }
  }
  if (author === undefined && nonEmpty[1] && /^(written\s+)?by\s+(.+)$/i.test(nonEmpty[1].l)) {
    author = nonEmpty[1].l.replace(/^(written\s+)?by\s+/i, '');
    authorLine = nonEmpty[1].i;
  }

  // Contact details: the trailing block of lines separated from the rest by a blank line.
  let contact: string | undefined;
  let end = lines.length - 1;
  while (end >= 0 && !lines[end]) end--;
  let start = end;
  while (start > 0 && lines[start - 1]) start--;
  if (end > Math.max(authorLine, nonEmpty[0].i)) {
    const block = lines.slice(start, end + 1);
    if (!(block.length === 1 && (block[0] === title || block[0] === author))) contact = block.join('\n');
  }

  return { title, author, contact };
}

/** Parse an FDX file. Throws on malformed XML or a non-Final-Draft document. */
export function parseFDX(xml: string): FDXImport {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const error = parsed.querySelector('parsererror');
  if (error) throw new Error('This file is not valid XML.');
  const root = parsed.documentElement;
  if (!root || root.tagName !== 'FinalDraft') throw new Error('This file is not a Final Draft document.');

  const content = Array.from(root.children).find(c => c.tagName === 'Content');
  const nodes = content ? paragraphsOf(content) : [];
  const doc = nodes.length ? screenplaySchema.nodes.doc.create({}, nodes) : emptyDoc();
  doc.check();
  return { doc, ...titlePageOf(root) };
}

function escapeXML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function styleFor(marks: readonly Mark[]): string | null {
  const parts: string[] = [];
  if (marks.some(m => m.type.name === 'bold')) parts.push('Bold');
  if (marks.some(m => m.type.name === 'italic')) parts.push('Italic');
  if (marks.some(m => m.type.name === 'underline')) parts.push('Underline');
  return parts.length ? parts.join('+') : null;
}

function textRuns(node: PMNode, indent: string, suffix = ''): string {
  const runs: string[] = [];
  const texts: PMNode[] = [];
  node.forEach(child => {
    if (child.isText) texts.push(child);
  });
  texts.forEach((child, i) => {
    const style = styleFor(child.marks);
    const text = (child.text || '') + (i === texts.length - 1 ? suffix : '');
    runs.push(`${indent}<Text${style ? ` Style="${style}"` : ''}>${escapeXML(text)}</Text>`);
  });
  if (runs.length === 0) runs.push(`${indent}<Text>${escapeXML(suffix)}</Text>`);
  return runs.join('\n');
}

function paragraphXML(node: PMNode, startsNewPage: boolean, indent: string, continued = false): string {
  const type = node.type.name as ElementType;
  const attrs: string[] = [`Type="${ELEMENT_TO_FDX[type]}"`];
  if (type === 'centered') attrs.push('Alignment="Center"');
  if (type === 'scene_heading' && node.attrs.number) attrs.push(`Number="${escapeXML(String(node.attrs.number))}"`);
  if (startsNewPage) attrs.push('StartsNewPage="Yes"');
  const suffix = continued ? cueDisplayText(node.textContent, true).slice(node.textContent.length) : '';
  let props = '';
  if (type === 'scene_heading' && (node.attrs.synopsis || node.attrs.color)) {
    const colorAttr = node.attrs.color ? ` Color="${escapeXML(cssColorToFdx(node.attrs.color))}"` : '';
    const summary = node.attrs.synopsis
      ? `\n${indent}    <Summary>\n` +
        String(node.attrs.synopsis)
          .split('\n')
          .map(line => `${indent}      <Paragraph>\n${indent}        <Text>${escapeXML(line)}</Text>\n${indent}      </Paragraph>`)
          .join('\n') +
        `\n${indent}    </Summary>\n${indent}  `
      : '';
    props = `${indent}  <SceneProperties${colorAttr} Title="">${summary}</SceneProperties>\n`;
  }
  return `${indent}<Paragraph ${attrs.join(' ')}>\n${props}${textRuns(node, indent + '  ', suffix)}\n${indent}</Paragraph>`;
}

/** Serialize a document as Final Draft XML. */
export function docToFDX(doc: PMNode, meta: { title: string; author?: string; contact?: string }): string {
  const nodes: PMNode[] = [];
  doc.forEach(n => nodes.push(n));
  const continued = continuedCues(doc);

  const out: string[] = [];
  let pendingBreak = false;
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (node.type.name === 'page_break') {
      pendingBreak = true;
      i++;
      continue;
    }
    if (!isElementType(node.type.name)) {
      i++;
      continue;
    }

    if (node.type.name === 'character' && node.attrs.dual === 'left') {
      // Collect: left speech, then the right speech, stopping when the second speech ends.
      const group: PMNode[] = [];
      let cues = 0;
      let j = i;
      while (j < nodes.length) {
        const n = nodes[j];
        const name = n.type.name;
        if (name === 'character') {
          if (cues === 2) break;
          cues++;
        } else if (name !== 'dialogue' && name !== 'parenthetical') {
          break;
        }
        group.push(n);
        j++;
      }
      if (cues === 2) {
        out.push('    <DualDialogue>');
        group.forEach((n, k) => out.push(paragraphXML(n, k === 0 && pendingBreak, '      ', continued.has(i + k))));
        out.push('    </DualDialogue>');
        pendingBreak = false;
        i = j;
        continue;
      }
    }

    out.push(paragraphXML(node, pendingBreak, '    ', continued.has(i)));
    pendingBreak = false;
    i++;
  }

  const titleLines = [meta.title.toUpperCase(), '', 'Written by', '', meta.author || ''].concat(meta.contact ? ['', '', ...meta.contact.split('\n')] : []);
  const titleXML = titleLines
    .map(line => `      <Paragraph Alignment="Center">\n        <Text>${escapeXML(line)}</Text>\n      </Paragraph>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${out.join('\n')}
  </Content>
  <TitlePage>
    <Content>
${titleXML}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}
