import { Schema, NodeType } from 'prosemirror-model';

/**
 * Screenplay document schema.
 *
 * The document is a flat list of screenplay elements. Pagination is a
 * presentation concern computed from the flat list, not part of the model,
 * which keeps every keystroke command simple: the parent of the cursor is
 * always the element being edited.
 */

export type ElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'centered';

/** Order used for the element menu and for Shift-Tab cycling. */
export const ELEMENT_ORDER: ElementType[] = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'centered'
];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  centered: 'Centered'
};

/** Element types whose text is always upper case. */
export const UPPERCASE_ELEMENTS: ReadonlySet<string> = new Set(['scene_heading', 'character', 'transition', 'shot']);

/**
 * Final Draft style element flow.
 * `enter` is the element created when Enter is pressed at the end of an element.
 * `tab` is the element created (or converted to) when Tab is pressed.
 */
export const ELEMENT_FLOW: Record<ElementType, { enter: ElementType; tab: ElementType }> = {
  scene_heading: { enter: 'action', tab: 'action' },
  action: { enter: 'action', tab: 'character' },
  character: { enter: 'dialogue', tab: 'parenthetical' },
  parenthetical: { enter: 'dialogue', tab: 'dialogue' },
  dialogue: { enter: 'action', tab: 'parenthetical' },
  transition: { enter: 'scene_heading', tab: 'scene_heading' },
  shot: { enter: 'action', tab: 'action' },
  centered: { enter: 'action', tab: 'action' }
};

function textBlock(className: string, tag = 'div', extra?: { attrs?: any; toDOM?: (node: any) => any }) {
  return {
    content: 'text*',
    group: 'block',
    ...(extra?.attrs ? { attrs: extra.attrs } : {}),
    parseDOM: [{ tag: `${tag}.${className}` }],
    toDOM: extra?.toDOM || (() => [tag, { class: className }, 0])
  };
}

export const screenplaySchema = new Schema({
  nodes: {
    doc: {
      content: 'block+'
    },

    // Declared first so it is the block ProseMirror creates when it must fill empty content.
    action: textBlock('action', 'p'),

    scene_heading: {
      content: 'text*',
      group: 'block',
      attrs: {
        number: { default: null }, // scene number, e.g. "12" or "A12"
        synopsis: { default: null }, // writer's summary, shown in the navigator and outline
        color: { default: null }, // outline card colour
        structure: { default: null } // structure label placed before this scene, e.g. "Act Two"
      },
      parseDOM: [{ tag: 'h2.scene-heading', getAttrs: (dom: any) => ({ number: dom.getAttribute('data-number') || null }) }],
      toDOM(node) {
        const attrs: Record<string, string> = { class: 'scene-heading' };
        if (node.attrs.number) attrs['data-number'] = node.attrs.number;
        if (node.attrs.color) attrs['data-color'] = node.attrs.color;
        return ['h2', attrs, 0];
      }
    },
    character: {
      content: 'text*',
      group: 'block',
      attrs: { dual: { default: null } }, // 'left' | 'right' when part of a dual-dialogue pair
      parseDOM: [{ tag: 'div.character', getAttrs: (dom: any) => ({ dual: dom.getAttribute('data-dual') || null }) }],
      toDOM(node) {
        const attrs: Record<string, string> = { class: 'character' };
        if (node.attrs.dual) attrs['data-dual'] = node.attrs.dual;
        return ['div', attrs, 0];
      }
    },
    parenthetical: textBlock('parenthetical'),
    dialogue: textBlock('dialogue'),
    transition: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'div.transition' }],
      toDOM(node) {
        // "FADE IN:" is conventionally flush left; every other transition is flush right.
        const flushLeft = /^FADE IN\b/i.test(node.textContent.trim());
        return ['div', { class: flushLeft ? 'transition transition-left' : 'transition' }, 0];
      }
    },
    shot: textBlock('shot', 'h3'),
    centered: textBlock('centered'),

    page_break: {
      group: 'block',
      atom: true,
      selectable: true,
      parseDOM: [{ tag: 'hr.page-break' }],
      toDOM() {
        return ['hr', { class: 'page-break' }];
      }
    },

    text: {
      group: 'inline'
    }
  },

  marks: {
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight', getAttrs: (value: string) => (/^(bold(er)?|[5-9]\d{2,})$/.test(value) ? null : false) }
      ],
      toDOM() {
        return ['strong', 0];
      }
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM() {
        return ['em', 0];
      }
    },
    underline: {
      parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
      toDOM() {
        return ['u', 0];
      }
    }
  }
});

export function isElementType(name: string): name is ElementType {
  return (ELEMENT_ORDER as string[]).includes(name);
}

export function nodeTypeFor(type: ElementType): NodeType {
  return screenplaySchema.nodes[type];
}

/** Create an empty document containing a single empty action element. */
export function emptyDoc() {
  return screenplaySchema.nodes.doc.create({}, [screenplaySchema.nodes.action.create()]);
}

/**
 * Upper-case a string without changing its length, so that cursor offsets
 * computed before the change remain valid afterwards. Characters whose upper
 * case form has a different length (e.g. "ß" -> "SS") are left alone.
 */
export function upperSameLength(text: string): string {
  let out = '';
  for (const ch of text) {
    const up = ch.toUpperCase();
    out += up.length === ch.length ? up : ch;
  }
  return out;
}
