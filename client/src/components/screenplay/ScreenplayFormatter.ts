import { 
  EditorView, 
  Decoration, 
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  Command,
  KeyBinding
} from '@codemirror/view';
import { 
  EditorState, 
  StateField, 
  StateEffect,
  Transaction,
  Extension,
  RangeSetBuilder
} from '@codemirror/state';
import { 
  ScreenplayElement, 
  SCREENPLAY_FORMATS, 
  ELEMENT_PATTERNS,
  ELEMENT_FLOW,
  TAB_CYCLE_ORDER
} from './ScreenplayTypes';
import { insertSuperimposed, insertIntercut, formatFlashback } from './SpecializedElements';

// State effect to set the element type for a line
const setElementType = StateEffect.define<{line: number, element: ScreenplayElement}>();

// State field to track element types for each line
const elementTypeField = StateField.define<Map<number, ScreenplayElement>>({
  create(state) {
    const map = new Map<number, ScreenplayElement>();
    
    // Initialize with detected elements
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      const prevElement = i > 1 ? map.get(i - 1) : undefined;
      const element = detectElementType(line.text, prevElement);
      map.set(i, element);
    }
    
    return map;
  },
  
  update(value, tr) {
    if (!tr.docChanged && !tr.effects.length) return value;
    
    const newMap = new Map(value);
    
    // Apply effects
    for (const effect of tr.effects) {
      if (effect.is(setElementType)) {
        newMap.set(effect.value.line, effect.value.element);
      }
    }
    
    // Handle document changes
    if (tr.docChanged) {
      const oldMap = new Map(newMap);
      newMap.clear();
      
      // Remap line numbers after document change
      oldMap.forEach((element, oldLine) => {
        const pos = tr.changes.mapPos(tr.startState.doc.line(oldLine).from);
        const newLine = tr.state.doc.lineAt(pos).number;
        newMap.set(newLine, element);
      });
    }
    
    return newMap;
  }
});

// Detect screenplay element type from text
function detectElementType(text: string, prevElement?: ScreenplayElement): ScreenplayElement {
  const trimmed = text.trim();
  
  // Empty line defaults to action
  if (!trimmed) return ScreenplayElement.Action;
  
  // Scene heading
  if (ELEMENT_PATTERNS.sceneHeading.test(trimmed)) {
    return ScreenplayElement.SceneHeading;
  }
  
  // Transition
  if (ELEMENT_PATTERNS.transition.test(trimmed)) {
    return ScreenplayElement.Transition;
  }
  
  // Fade in (special case of transition)
  if (ELEMENT_PATTERNS.fadeIn.test(trimmed)) {
    return ScreenplayElement.Transition;
  }
  
  // Shot
  if (ELEMENT_PATTERNS.shot.test(trimmed)) {
    return ScreenplayElement.Shot;
  }
  
  // Montage
  if (ELEMENT_PATTERNS.montage.test(trimmed)) {
    return ScreenplayElement.Montage;
  }
  
  // Parenthetical - must be between character and dialogue
  if (ELEMENT_PATTERNS.parenthetical.test(trimmed) && 
      prevElement === ScreenplayElement.Character) {
    return ScreenplayElement.Parenthetical;
  }
  
  // Character - all caps, not too long
  if (ELEMENT_PATTERNS.character.test(trimmed) && 
      trimmed.length <= 35 &&
      trimmed === trimmed.toUpperCase()) {
    return ScreenplayElement.Character;
  }
  
  // Dialogue - follows character or parenthetical (or dialogue for multi-line)
  if (prevElement === ScreenplayElement.Character || 
      prevElement === ScreenplayElement.Parenthetical ||
      prevElement === ScreenplayElement.Dialogue) {
    // Continue dialogue unless it's an empty line followed by another empty line
    if (trimmed || prevElement !== ScreenplayElement.Dialogue) {
      return ScreenplayElement.Dialogue;
    }
  }
  
  // Default to action
  return ScreenplayElement.Action;
}

// Format text based on element type
function formatText(text: string, element: ScreenplayElement): string {
  const format = SCREENPLAY_FORMATS[element];
  
  switch (format.textCase) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      // Preserve proper nouns
      return text.toLowerCase().replace(/\b[A-Z][a-z]+/g, match => match);
    case 'sentence':
      // Capitalize first letter, preserve character names in CAPS
      return text.charAt(0).toUpperCase() + text.slice(1);
    default:
      return text;
  }
}

// Calculate indentation in pixels (12pt Courier: 1 char ≈ 7.2px)
function getIndentPixels(inches: number): number {
  // 1 inch = 72 points, Courier 12pt ≈ 10 chars/inch
  return Math.round(inches * 72);
}

// Smart Enter command
export const smartEnter: Command = (view) => {
  const state = view.state;
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.head);
  const lineNum = line.number;
  
  const elementTypes = state.field(elementTypeField);
  const currentElement = elementTypes.get(lineNum) || ScreenplayElement.Action;
  const nextElement = ELEMENT_FLOW[currentElement] || ScreenplayElement.Action;
  
  // Insert new line
  const changes = state.changeByRange(range => ({
    changes: { from: range.to, insert: '\n' },
    range: { from: range.to + 1, to: range.to + 1 }
  }));
  
  // Set element type for new line
  const effects = [
    setElementType.of({ line: lineNum + 1, element: nextElement })
  ];
  
  view.dispatch({ ...changes, effects });
  
  return true;
};

// Smart Tab command - cycle through element types
export const smartTab: Command = (view) => {
  const state = view.state;
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.head);
  const lineNum = line.number;
  
  const elementTypes = state.field(elementTypeField);
  const currentElement = elementTypes.get(lineNum) || ScreenplayElement.Action;
  
  // Find next element in cycle
  const currentIndex = TAB_CYCLE_ORDER.indexOf(currentElement);
  const nextIndex = (currentIndex + 1) % TAB_CYCLE_ORDER.length;
  const nextElement = TAB_CYCLE_ORDER[nextIndex];
  
  // Update element type
  view.dispatch({
    effects: setElementType.of({ line: lineNum, element: nextElement })
  });
  
  return true;
};

// Create line decorations based on element types
function createDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const elementTypes = view.state.field(elementTypeField);
  
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    const prevElement = i > 1 ? elementTypes.get(i - 1) : undefined;
    const element = elementTypes.get(i) || detectElementType(line.text, prevElement);
    const format = SCREENPLAY_FORMATS[element];
    
    // Create CSS classes for formatting
    const classes = [`cm-screenplay-${element}`];
    
    // Only add alignment class if not default left
    if (format.alignment !== 'left') {
      classes.push(`cm-screenplay-align-${format.alignment}`);
    }
    
    // Add line decoration
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: classes.join(' '),
        attributes: {
          'data-element': element
        }
      })
    );
  }
  
  return builder.finish();
}

// View plugin for screenplay formatting
const screenplayPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  
  constructor(view: EditorView) {
    this.decorations = createDecorations(view);
  }
  
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || 
        update.transactions.some(tr => tr.effects.length > 0)) {
      this.decorations = createDecorations(update.view);
    }
  }
}, {
  decorations: v => v.decorations
});

// Auto-detect and format as user types
const autoFormatPlugin = EditorView.updateListener.of((update: ViewUpdate) => {
  if (!update.docChanged) return;
  
  const effects: StateEffect<any>[] = [];
  const elementTypes = update.state.field(elementTypeField);
  
  // Check each changed line
  update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const startLine = update.state.doc.lineAt(fromB).number;
    const endLine = Math.min(update.state.doc.lines, update.state.doc.lineAt(toB).number + 2); // Check 2 lines after for dialogue
    
    for (let i = startLine; i <= endLine; i++) {
      const line = update.state.doc.line(i);
      const prevElement = i > 1 ? elementTypes.get(i - 1) : undefined;
      const detectedElement = detectElementType(line.text, prevElement);
      const currentElement = elementTypes.get(i);
      
      if (currentElement !== detectedElement) {
        effects.push(setElementType.of({ line: i, element: detectedElement }));
      }
    }
  });
  
  if (effects.length > 0) {
    update.view.dispatch({ effects });
  }
});

// Key bindings
export const screenplayKeymap: KeyBinding[] = [
  { key: 'Enter', run: smartEnter },
  { key: 'Tab', run: smartTab },
  { key: 'Alt-s', run: insertSuperimposed },
  { key: 'Alt-i', run: insertIntercut },
  { key: 'Alt-f', run: formatFlashback },
  { key: 'Shift-Tab', run: (view) => {
    // Reverse tab cycle
    const state = view.state;
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    const lineNum = line.number;
    
    const elementTypes = state.field(elementTypeField);
    const currentElement = elementTypes.get(lineNum) || ScreenplayElement.Action;
    
    // Find previous element in cycle
    const currentIndex = TAB_CYCLE_ORDER.indexOf(currentElement);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : TAB_CYCLE_ORDER.length - 1;
    const prevElement = TAB_CYCLE_ORDER[prevIndex];
    
    // Update element type
    view.dispatch({
      effects: setElementType.of({ line: lineNum, element: prevElement })
    });
    
    return true;
  }}
];

// Main screenplay formatting extension
export function screenplayFormatting(): Extension {
  return [
    elementTypeField,
    screenplayPlugin,
    autoFormatPlugin,
    EditorView.theme({
      // Scene headings
      '.cm-screenplay-scene-heading': {
        textTransform: 'uppercase',
        fontWeight: 'bold',
        marginTop: '24pt',
        marginBottom: '12pt'
      },
      
      // Action lines
      '.cm-screenplay-action': {
        marginTop: '12pt',
        marginBottom: '12pt'
      },
      
      // Character names
      '.cm-screenplay-character': {
        textTransform: 'uppercase',
        marginTop: '12pt',
        marginBottom: '0'
      },
      
      // Parentheticals
      '.cm-screenplay-parenthetical': {
        fontStyle: 'italic',
        marginTop: '0',
        marginBottom: '0'
      },
      
      // Dialogue
      '.cm-screenplay-dialogue': {
        marginTop: '0',
        marginBottom: '12pt'
      },
      
      // Transitions
      '.cm-screenplay-transition': {
        textTransform: 'uppercase',
        marginTop: '12pt',
        marginBottom: '12pt'
      },
      
      // Alignment classes
      '.cm-screenplay-align-right': {
        textAlign: 'right !important',
        marginLeft: 'auto !important',
        marginRight: '0 !important'
      },
      
      '.cm-screenplay-align-center': {
        textAlign: 'center !important'
      }
    })
  ];
}