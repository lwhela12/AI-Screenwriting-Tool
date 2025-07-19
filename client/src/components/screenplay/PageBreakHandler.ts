import { 
  EditorView, 
  Decoration,
  WidgetType,
  ViewPlugin,
  ViewUpdate
} from '@codemirror/view';
import { 
  StateField,
  StateEffect,
  Extension
} from '@codemirror/state';
import { ScreenplayElement } from './ScreenplayTypes';

// Constants
const LINES_PER_PAGE = 55;
const PAGE_BREAK_MARGIN = 3; // Lines from bottom to insert (MORE)

// Widget for (MORE)
class MoreWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-screenplay-more';
    span.textContent = '(MORE)';
    return span;
  }
}

// Widget for (CONT'D)
class ContdWidget extends WidgetType {
  constructor(private characterName: string) {
    super();
  }
  
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-screenplay-contd';
    span.textContent = ` (CONT'D)`;
    return span;
  }
}

// Track dialogue continuations across pages
interface DialogueContinuation {
  characterName: string;
  startLine: number;
  endLine: number;
  pageBreakLine: number;
}

// State field for tracking continuations
const continuationField = StateField.define<DialogueContinuation[]>({
  create() {
    return [];
  },
  
  update(continuations, tr) {
    if (!tr.docChanged) return continuations;
    
    // Recalculate continuations after document change
    return calculateContinuations(tr.state);
  }
});

// Calculate where dialogue breaks across pages
function calculateContinuations(state: any): DialogueContinuation[] {
  const continuations: DialogueContinuation[] = [];
  
  let currentCharacter: string | null = null;
  let dialogueStartLine: number | null = null;
  
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const text = line.text.trim();
    const prevLine = i > 1 ? state.doc.line(i - 1).text.trim() : '';
    
    // Detect character names (all caps, not too long)
    if (/^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(text) && 
        text === text.toUpperCase() &&
        i < state.doc.lines) {
      currentCharacter = text;
      dialogueStartLine = i;
    }
    
    // Check if this is dialogue or parenthetical
    const isParenthetical = /^\([^)]+\)$/.test(text);
    const isDialogue = prevLine && (
      /^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(prevLine) || 
      /^\([^)]+\)$/.test(prevLine)
    );
    
    // Check if dialogue continues past page break
    if ((isDialogue || isParenthetical) && currentCharacter) {
      const pageNum = Math.floor((i - 1) / LINES_PER_PAGE) + 1;
      const nextPageNum = Math.floor(i / LINES_PER_PAGE) + 1;
      
      if (pageNum !== nextPageNum) {
        // Dialogue crosses page boundary
        continuations.push({
          characterName: currentCharacter,
          startLine: dialogueStartLine!,
          endLine: i,
          pageBreakLine: pageNum * LINES_PER_PAGE
        });
      }
    }
    
    // Reset on non-dialogue elements
    if (!isDialogue && !isParenthetical && 
        !(/^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(text) && text === text.toUpperCase())) {
      currentCharacter = null;
      dialogueStartLine = null;
    }
  }
  
  return continuations;
}

// Plugin to add (MORE) and (CONT'D) decorations
const pageBreakPlugin = ViewPlugin.fromClass(class {
  decorations: any;
  
  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }
  
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  
  buildDecorations(view: EditorView) {
    const widgets: any[] = [];
    const continuations = view.state.field(continuationField);
    
    // Add (MORE) and (CONT'D) widgets
    continuations.forEach(cont => {
      // Add (MORE) at bottom of page
      const pageBreakLine = view.state.doc.line(cont.pageBreakLine);
      widgets.push(
        Decoration.widget({
          widget: new MoreWidget(),
          side: 1
        }).range(pageBreakLine.to)
      );
      
      // Add (CONT'D) after character name on next page
      if (cont.pageBreakLine + 1 <= view.state.doc.lines) {
        const nextLine = view.state.doc.line(cont.pageBreakLine + 1);
        widgets.push(
          Decoration.widget({
            widget: new ContdWidget(cont.characterName),
            side: 1
          }).range(nextLine.from)
        );
      }
    });
    
    return Decoration.set(widgets);
  }
}, {
  decorations: v => v.decorations
});

// Title page support
export const titlePageTheme = EditorView.theme({
  '.cm-title-page .cm-line:first-child': {
    marginTop: '3in',
    textAlign: 'center',
    textTransform: 'uppercase',
    fontSize: '14pt',
    fontWeight: 'bold'
  },
  
  '.cm-title-page .cm-line:nth-child(2)': {
    textAlign: 'center',
    marginTop: '24pt'
  },
  
  '.cm-title-page .cm-line:nth-child(3)': {
    textAlign: 'center',
    marginTop: '12pt',
    marginBottom: '3in'
  },
  
  '.cm-title-page .cm-line:last-child': {
    position: 'absolute',
    bottom: '1in',
    left: '1.5in',
    fontSize: '10pt'
  }
});

// Dual dialogue support
class DualDialogueWidget extends WidgetType {
  constructor(
    private leftCharacter: string,
    private leftDialogue: string[],
    private rightCharacter: string,
    private rightDialogue: string[]
  ) {
    super();
  }
  
  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-dual-dialogue-container';
    
    // Left side
    const leftDiv = document.createElement('div');
    leftDiv.className = 'cm-screenplay-dual-dialogue-left';
    
    const leftChar = document.createElement('div');
    leftChar.className = 'cm-screenplay-character';
    leftChar.textContent = this.leftCharacter;
    leftDiv.appendChild(leftChar);
    
    this.leftDialogue.forEach(line => {
      const p = document.createElement('div');
      p.className = 'cm-screenplay-dialogue';
      p.textContent = line;
      leftDiv.appendChild(p);
    });
    
    // Right side
    const rightDiv = document.createElement('div');
    rightDiv.className = 'cm-screenplay-dual-dialogue-right';
    
    const rightChar = document.createElement('div');
    rightChar.className = 'cm-screenplay-character';
    rightChar.textContent = this.rightCharacter;
    rightDiv.appendChild(rightChar);
    
    this.rightDialogue.forEach(line => {
      const p = document.createElement('div');
      p.className = 'cm-screenplay-dialogue';
      p.textContent = line;
      rightDiv.appendChild(p);
    });
    
    container.appendChild(leftDiv);
    container.appendChild(rightDiv);
    
    // Clear float
    const clear = document.createElement('div');
    clear.className = 'cm-screenplay-dual-dialogue-clear';
    container.appendChild(clear);
    
    return container;
  }
}

// Extensions for specialized elements
export function pageBreakHandling(): Extension {
  return [
    continuationField,
    pageBreakPlugin
  ];
}

// Helper to format character first appearance
export function formatCharacterFirstAppearance(text: string): string {
  // Track seen characters
  const seenCharacters = new Set<string>();
  
  return text.replace(/\b([A-Z][A-Z\s]+)\b/g, (match) => {
    const normalized = match.trim().toUpperCase();
    if (!seenCharacters.has(normalized) && normalized.length > 2) {
      seenCharacters.add(normalized);
      return match.toUpperCase();
    }
    return match;
  });
}

// Helper to format key sounds
export function formatKeySounds(text: string): string {
  const soundPatterns = [
    /\b(BANG|BOOM|CRASH|GUNSHOT|EXPLOSION|SCREAM|WHISTLE|RING|BUZZ|BEEP|HONK|SLAM|THUD|CRACK|POP|HISS|SIZZLE|RUMBLE|ROAR|WHOOSH|CLICK|CLACK|SNAP|CRUNCH|SPLASH|DRIP|TICK|TOCK|DING|DONG|CHIME|CLANG|CLATTER|RATTLE|SCREECH|SQUEAL|GROAN|MOAN|SIGH|GASP|COUGH|SNEEZE|LAUGH|GIGGLE|CRY|SOB|WHIMPER|GROWL|BARK|MEOW|CHIRP|TWEET|HOWL|HOOT|BUZZ|HUM|WHIR|PURR|RUSTLE|CRACKLE|FIZZ|BUBBLE|GURGLE|SLURP|CHOMP|MUNCH|CREAK|SQUEAK|GRIND|SCRAPE|SCRATCH|TAP|KNOCK|POUND|THUMP|STOMP|SHUFFLE|PATTER|FOOTSTEPS|HEARTBEAT|BREATHING|WIND|RAIN|THUNDER|LIGHTNING)\b/gi
  ];
  
  let result = text;
  soundPatterns.forEach(pattern => {
    result = result.replace(pattern, match => match.toUpperCase());
  });
  
  return result;
}

// Helper to detect and format montages
export function formatMontage(lines: string[]): string[] {
  const formatted: string[] = [];
  let inMontage = false;
  
  lines.forEach((line, index) => {
    const montagePattern = /^(MONTAGE|SERIES OF SHOTS)/i;
    if (montagePattern.test(line.trim())) {
      inMontage = true;
      formatted.push(line.toUpperCase());
    } else if (inMontage && line.trim() === '') {
      inMontage = false;
      formatted.push(line);
    } else if (inMontage && line.trim()) {
      // Format as montage item
      if (line.trim().match(/^[A-Z]\./)) {
        // Already has letter prefix
        formatted.push(line);
      } else if (line.trim().startsWith('-')) {
        // Already has dash prefix
        formatted.push(line);
      } else {
        // Add dash prefix
        formatted.push(`- ${line.trim()}`);
      }
    } else {
      formatted.push(line);
    }
  });
  
  return formatted;
}