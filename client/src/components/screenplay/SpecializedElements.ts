import { 
  EditorView, 
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  Command
} from '@codemirror/view';
import { 
  StateField,
  StateEffect,
  Extension
} from '@codemirror/state';
import { ScreenplayElement } from './ScreenplayTypes';

// Patterns for specialized elements
const SPECIALIZED_PATTERNS = {
  superimposed: /^(SUPER:|SUPERIMPOSE:|TITLE:|SUBTITLE:)/i,
  intercut: /^INTERCUT/i,
  flashback: /^(FLASHBACK|FLASH BACK)/i,
  flashforward: /^(FLASHFORWARD|FLASH FORWARD)/i,
  freeze: /^FREEZE FRAME/i,
  timecut: /^(LATER|MOMENTS LATER|CONTINUOUS|SAME|BACK TO)/i,
  insert: /^INSERT/i,
  closeup: /^(C\.U\.|CLOSE UP|CLOSEUP|CLOSE ON)/i,
  angle: /^(ANGLE ON|ON:|FAVOR ON|FAVORING)/i,
  pov: /^(POV|P\.O\.V\.)/i,
  splitScreen: /^SPLIT SCREEN/i,
  stockShot: /^STOCK SHOT/i,
  matchCut: /^MATCH CUT/i,
  series: /^SERIES OF SHOTS/i,
  backTo: /^BACK TO/i,
};

// Command to insert superimposed text
export const insertSuperimposed: Command = (view) => {
  const { from, to } = view.state.selection.main;
  const insertion = 'SUPER: ';
  
  view.dispatch({
    changes: { from, to, insert: insertion },
    selection: { anchor: from + insertion.length }
  });
  
  return true;
};

// Command to insert intercut
export const insertIntercut: Command = (view) => {
  const { from, to } = view.state.selection.main;
  const insertion = 'INTERCUT - ';
  
  view.dispatch({
    changes: { from, to, insert: insertion },
    selection: { anchor: from + insertion.length }
  });
  
  return true;
};

// Command to format as flashback
export const formatFlashback: Command = (view) => {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const text = line.text.trim();
  
  // If it's a scene heading, add FLASHBACK
  if (/^(INT|EXT|EST)[\.\s]/i.test(text) && !text.includes('FLASHBACK')) {
    const newText = text + ' - FLASHBACK';
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText }
    });
  } else {
    // Insert FLASHBACK: on new line
    view.dispatch({
      changes: { from: selection.from, insert: 'FLASHBACK:\n\n' }
    });
  }
  
  return true;
};

// Detect specialized elements and apply formatting
function detectSpecializedElement(text: string): string | null {
  const trimmed = text.trim();
  
  for (const [element, pattern] of Object.entries(SPECIALIZED_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return element;
    }
  }
  
  return null;
}

// Plugin to highlight specialized elements
const specializedElementsPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  
  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }
  
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  
  buildDecorations(view: EditorView) {
    const decorations: any[] = [];
    
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i);
      const text = line.text;
      const element = detectSpecializedElement(text);
      
      if (element) {
        // Apply specialized formatting
        let className = 'cm-screenplay-specialized';
        
        switch (element) {
          case 'superimposed':
          case 'insert':
          case 'freeze':
            className = 'cm-screenplay-super';
            break;
          case 'intercut':
          case 'splitScreen':
            className = 'cm-screenplay-intercut';
            break;
          case 'flashback':
          case 'flashforward':
          case 'backTo':
            className = 'cm-screenplay-flashback';
            break;
          case 'closeup':
          case 'angle':
          case 'pov':
            className = 'cm-screenplay-shot';
            break;
          case 'timecut':
            className = 'cm-screenplay-timecut';
            break;
        }
        
        decorations.push(
          Decoration.line({
            class: className,
            attributes: {
              'data-element': element
            }
          }).range(line.from)
        );
      }
    }
    
    return Decoration.set(decorations);
  }
}, {
  decorations: v => v.decorations
});

// Theme for specialized elements
const specializedTheme = EditorView.theme({
  '.cm-screenplay-super': {
    textTransform: 'uppercase',
    fontWeight: 'bold',
    background: 'rgba(255, 255, 0, 0.1)',
    padding: '2px 4px',
    borderRadius: '2px'
  },
  
  '.cm-screenplay-intercut': {
    textTransform: 'uppercase',
    fontStyle: 'italic',
    color: '#0066cc'
  },
  
  '.cm-screenplay-flashback': {
    textTransform: 'uppercase',
    fontStyle: 'italic',
    opacity: 0.9,
    borderLeft: '3px solid #999',
    paddingLeft: '5px'
  },
  
  '.cm-screenplay-timecut': {
    textTransform: 'uppercase',
    textAlign: 'center',
    fontStyle: 'italic',
    margin: '12pt 0'
  },
  
  // Dark mode
  '.cm-theme-dark .cm-screenplay-super': {
    background: 'rgba(255, 255, 0, 0.2)'
  },
  
  '.cm-theme-dark .cm-screenplay-intercut': {
    color: '#66b3ff'
  },
  
  '.cm-theme-dark .cm-screenplay-flashback': {
    borderLeftColor: '#666'
  }
});

// Auto-format capitalized words in action lines
export function formatActionCapitals(text: string): string {
  // Character first appearance (multiple consecutive caps words)
  let formatted = text.replace(/\b([A-Z][A-Z\s]+[A-Z])\b/g, (match) => {
    // Check if it's likely a character name (2-4 words, reasonable length)
    const words = match.trim().split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && match.length <= 30) {
      return match.toUpperCase();
    }
    return match;
  });
  
  // Key sounds
  const sounds = [
    'BANG', 'BOOM', 'CRASH', 'GUNSHOT', 'EXPLOSION', 'SCREAM',
    'WHISTLE', 'RING', 'BUZZ', 'BEEP', 'HONK', 'SLAM', 'THUD',
    'CRACK', 'POP', 'HISS', 'SIZZLE', 'RUMBLE', 'ROAR', 'WHOOSH',
    'CLICK', 'CLACK', 'SNAP', 'CRUNCH', 'SPLASH', 'DRIP'
  ];
  
  const soundPattern = new RegExp(`\\b(${sounds.join('|')})\\b`, 'gi');
  formatted = formatted.replace(soundPattern, match => match.toUpperCase());
  
  return formatted;
}

// Extension for specialized elements
export function specializedElements(): Extension {
  return [
    specializedElementsPlugin,
    specializedTheme
  ];
}

// Helper to handle end of act formatting
export function formatEndOfAct(actNumber: number): string {
  return `\n\n${' '.repeat(35)}END OF ACT ${actNumber}\n\n`;
}

// Helper to format title page
export function formatTitlePage(title: string, author: string, contact?: string): string {
  const lines: string[] = [];
  
  // Title (centered, 3 inches from top)
  lines.push('\n'.repeat(12)); // Approximately 3 inches in 12pt Courier
  lines.push(title.toUpperCase());
  lines.push('\n\n');
  lines.push('Written by');
  lines.push('\n');
  lines.push(author);
  
  // Contact info (bottom left)
  if (contact) {
    lines.push('\n'.repeat(20)); // Push to bottom
    lines.push(contact);
  }
  
  return lines.join('\n');
}

// Helper to format revision marks
export function addRevisionMark(text: string, revisionColor: string = '*'): string {
  return `${revisionColor}${text}`;
}