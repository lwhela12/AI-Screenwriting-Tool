import { Schema } from 'prosemirror-model';

// Define the screenplay schema with all element types
export const screenplaySchema = new Schema({
  nodes: {
    // Root document contains pages
    doc: {
      content: 'page+'
    },
    
    // Page node - represents a single screenplay page
    page: {
      content: '(scene_heading | action | character | parenthetical | dialogue | transition | centered | page_break)+',
      attrs: {
        number: { default: 1 }
      },
      parseDOM: [{ tag: 'div.screenplay-page' }],
      toDOM(node) {
        return ['div', { 
          class: 'screenplay-page', 
          'data-page-number': node.attrs.number 
        }, 0];
      }
    },
    
    
    // Scene heading (INT. LOCATION - TIME)
    scene_heading: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'h2.scene-heading' }],
      toDOM() {
        return ['h2', { class: 'scene-heading' }, 0];
      }
    },
    
    // Action lines (description)
    action: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'p.action' }],
      toDOM() {
        return ['p', { class: 'action' }, 0];
      }
    },
    
    // Character name (before dialogue)
    character: {
      content: 'text*',
      group: 'block',
      attrs: {
        extension: { default: null } // For (V.O.), (O.S.), etc.
      },
      parseDOM: [{ tag: 'div.character' }],
      toDOM(node) {
        return ['div', { class: 'character' }, 0];
      }
    },
    
    // Parenthetical (character direction)
    parenthetical: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'div.parenthetical' }],
      toDOM() {
        return ['div', { class: 'parenthetical' }, 0];
      }
    },
    
    // Dialogue
    dialogue: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'div.dialogue' }],
      toDOM() {
        return ['div', { class: 'dialogue' }, 0];
      }
    },
    
    // Transitions (CUT TO:, FADE OUT., etc.)
    transition: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'div.transition' }],
      toDOM() {
        return ['div', { class: 'transition' }, 0];
      }
    },
    
    // Centered text
    centered: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'div.centered' }],
      toDOM() {
        return ['div', { class: 'centered' }, 0];
      }
    },
    
    // Page break marker
    page_break: {
      group: 'block',
      atom: true,
      parseDOM: [{ tag: 'hr.page-break' }],
      toDOM() {
        return ['hr', { class: 'page-break' }];
      }
    },
    
    // Text node
    text: {
      group: 'inline'
    }
  },
  
  marks: {
    // Bold (rarely used in screenplays)
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight', getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
      ],
      toDOM() { return ['strong', 0]; }
    },
    
    // Italic (for emphasis)
    italic: {
      parseDOM: [
        { tag: 'em' },
        { tag: 'i' },
        { style: 'font-style=italic' }
      ],
      toDOM() { return ['em', 0]; }
    },
    
    // Underline (rarely used)
    underline: {
      parseDOM: [
        { tag: 'u' },
        { style: 'text-decoration=underline' }
      ],
      toDOM() { return ['u', 0]; }
    }
  }
});

// Helper to create a new page node
export function createPage(pageNumber: number) {
  // Create an empty action node (block nodes can be empty)
  const actionNode = screenplaySchema.nodes.action.createAndFill();
  return screenplaySchema.nodes.page.create({ number: pageNumber }, [actionNode]);
}

// Helper to detect element type from text
export function detectElementType(text: string, prevNodeType?: string): string {
  const trimmed = text.trim();
  
  // Scene heading
  if (/^(INT|EXT|EST|I\/E)[\.\s]/i.test(trimmed)) {
    return 'scene_heading';
  }
  
  // Transition
  if (/^(FADE IN:|FADE OUT\.|FADE TO:|CUT TO:|DISSOLVE TO:|SMASH CUT:|MATCH CUT:)$/i.test(trimmed)) {
    return 'transition';
  }
  
  // Parenthetical
  if (/^\(.+\)$/.test(trimmed) && prevNodeType === 'character') {
    return 'parenthetical';
  }
  
  // Character (all caps, possibly with extension)
  if (trimmed.length > 0 && 
      trimmed.length <= 35 &&
      trimmed === trimmed.toUpperCase() &&
      !trimmed.includes('.') &&
      (prevNodeType === 'action' || prevNodeType === 'scene_heading')) {
    return 'character';
  }
  
  // Dialogue (follows character or parenthetical)
  if (prevNodeType === 'character' || prevNodeType === 'parenthetical') {
    return 'dialogue';
  }
  
  // Default to action
  return 'action';
}