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
import { addSmartTypeEntry } from './SmartType';

// State effect to set the element type for a line
const setElementType = StateEffect.define<{line: number, element: ScreenplayElement}>();

// State field to track element types for each line with persistence
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
    
    // Apply effects first (manual changes take precedence)
    for (const effect of tr.effects) {
      if (effect.is(setElementType)) {
        newMap.set(effect.value.line, effect.value.element);
      }
    }
    
    // Handle document changes
    if (tr.docChanged) {
      const tempMap = new Map<number, ScreenplayElement>();
      
      // First pass: preserve existing elements that weren't deleted
      tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        // Map old line numbers to new positions
        for (let i = 1; i <= tr.startState.doc.lines; i++) {
          if (value.has(i)) {
            try {
              const oldLine = tr.startState.doc.line(i);
              const newPos = tr.changes.mapPos(oldLine.from);
              
              // Check if the line still exists
              if (newPos >= 0 && newPos <= tr.state.doc.length) {
                const newLine = tr.state.doc.lineAt(newPos);
                // Preserve element type if the line wasn't completely replaced
                if (oldLine.text.trim() !== '' || newLine.text.trim() === '') {
                  tempMap.set(newLine.number, value.get(i)!);
                }
              }
            } catch (e) {
              // Line was deleted, skip it
            }
          }
        }
      });
      
      // Second pass: merge with newMap, preserving manual changes
      tempMap.forEach((element, line) => {
        if (!newMap.has(line)) {
          newMap.set(line, element);
        }
      });
      
      // Third pass: detect types for new lines only
      for (let i = 1; i <= tr.state.doc.lines; i++) {
        if (!newMap.has(i)) {
          const line = tr.state.doc.line(i);
          const prevElement = i > 1 ? newMap.get(i - 1) : undefined;
          const element = detectElementType(line.text, prevElement);
          newMap.set(i, element);
        }
      }
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
  
  // Character - Context-based detection, not just capitalization
  // If previous element was action/dialogue/scene and this is all caps
  if (trimmed.length <= 35 &&
      trimmed === trimmed.toUpperCase() &&
      !trimmed.includes('.') &&
      !/^\d+$/.test(trimmed) &&
      (prevElement === ScreenplayElement.Action || 
       prevElement === ScreenplayElement.Dialogue ||
       prevElement === ScreenplayElement.SceneHeading ||
       !prevElement)) {
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
  const lineText = line.text.trim();
  
  const elementTypes = state.field(elementTypeField);
  const currentElement = elementTypes.get(lineNum) || ScreenplayElement.Action;

  let nextElement = ELEMENT_FLOW[currentElement] || ScreenplayElement.Action;

  // If current line is empty and we're in character mode, don't add dialogue
  if (currentElement === ScreenplayElement.Character && !lineText) {
    // Just insert a new line and stay in action mode
    const changes = state.changeByRange(range => ({
      changes: { from: range.to, insert: '\n' },
      range: { from: range.to + 1, to: range.to + 1 }
    }));
    view.dispatch(changes);
    return true;
  }
  
  // If we have a character name, auto-capitalize it before moving to dialogue
  if (currentElement === ScreenplayElement.Character && lineText.length > 0) {
    const upperText = lineText.toUpperCase();
    if (lineText !== upperText) {
      // First update the character name to uppercase
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: upperText }
      });
    }
  }

  // Handle Action element behavior
  if (currentElement === ScreenplayElement.Action) {
    if (!lineText) {
      const prev = lineNum > 1 ? elementTypes.get(lineNum - 1) : undefined;
      if (prev === ScreenplayElement.Action) {
        nextElement = ScreenplayElement.Character;
      }
    } else {
      nextElement = ScreenplayElement.Action;
    }
  }

  // Collect SmartType data when completing elements
  const smartEffects: StateEffect<any>[] = [];
  if (currentElement === ScreenplayElement.Character && lineText) {
    smartEffects.push(addSmartTypeEntry.of({ list: 'characters', value: lineText }));
  }
  if (currentElement === ScreenplayElement.SceneHeading && lineText) {
    const match = /^(?:INT\.|EXT\.|I\/E\.|E\/I\.)\s+(.*?)(?:\s+-\s+(\w+))?$/i.exec(lineText.toUpperCase());
    if (match) {
      if (match[1]) smartEffects.push(addSmartTypeEntry.of({ list: 'locations', value: match[1].trim() }));
      if (match[2]) smartEffects.push(addSmartTypeEntry.of({ list: 'times', value: match[2].trim() }));
    }
  }
  if (currentElement === ScreenplayElement.Transition && lineText) {
    const text = lineText.toUpperCase().endsWith(':') ? lineText.toUpperCase() : lineText.toUpperCase() + ':';
    smartEffects.push(addSmartTypeEntry.of({ list: 'transitions', value: text }));
  }
  
  // Insert new line
  const changes = state.changeByRange(range => ({
    changes: { from: range.to, insert: '\n' },
    range: { from: range.to + 1, to: range.to + 1 }
  }));
  
  // Set element type for new line
  const effects = [
    setElementType.of({ line: lineNum + 1, element: nextElement }),
    ...smartEffects
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
  const lineText = line.text.trim();
  
  const elementTypes = state.field(elementTypeField);
  const currentElement = elementTypes.get(lineNum) || ScreenplayElement.Action;
  
  // Get previous non-empty line's element type
  let prevElement: ScreenplayElement | undefined;
  for (let i = lineNum - 1; i >= 1; i--) {
    const prevLine = state.doc.line(i);
    if (prevLine.text.trim()) {
      prevElement = elementTypes.get(i);
      break;
    }
  }
  
  // Smart behavior: After action/dialogue/scene, Tab on empty line creates character
  if (lineText.length === 0 && 
      (prevElement === ScreenplayElement.Action || 
       prevElement === ScreenplayElement.Dialogue ||
       prevElement === ScreenplayElement.SceneHeading)) {
    // Empty line after action/dialogue/scene - create character element
    view.dispatch({
      effects: setElementType.of({ line: lineNum, element: ScreenplayElement.Character })
    });
    return true;
  }
  
  // If typing text on a line after action/dialogue/scene, convert to character
  if (lineText.length > 0 && lineText.length <= 35 &&
      currentElement === ScreenplayElement.Action &&
      (prevElement === ScreenplayElement.Action || 
       prevElement === ScreenplayElement.Dialogue ||
       prevElement === ScreenplayElement.SceneHeading ||
       !prevElement)) {
    
    const upperText = lineText.toUpperCase();
    // Replace the line text with uppercase version and set as character
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: upperText },
      effects: setElementType.of({ line: lineNum, element: ScreenplayElement.Character })
    });
    return true;
  }
  
  // Always capitalize character names and allow creating parenthetical
  if (currentElement === ScreenplayElement.Character) {
    if (lineText.length > 0) {
      const upperText = lineText.toUpperCase();
      if (lineText !== upperText) {
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: upperText }
        });
      }
    }
    // From a character line, Tab creates a parenthetical on new line
    const insertPos = line.to;
    view.dispatch({
      changes: { from: insertPos, insert: '\n()' },
      effects: setElementType.of({ line: lineNum + 1, element: ScreenplayElement.Parenthetical })
    });
    
    // Set cursor position inside parentheses after a small delay
    requestAnimationFrame(() => {
      view.dispatch({
        selection: { anchor: insertPos + 2 }
      });
    });
    return true;
  }
  
  // For other cases, cycle through element types
  const currentIndex = TAB_CYCLE_ORDER.indexOf(currentElement);
  const nextIndex = (currentIndex + 1) % TAB_CYCLE_ORDER.length;
  const nextElement = TAB_CYCLE_ORDER[nextIndex];
  
  // If moving to character, auto-capitalize
  if (nextElement === ScreenplayElement.Character && lineText.length > 0) {
    const upperText = lineText.toUpperCase();
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: upperText },
      effects: setElementType.of({ line: lineNum, element: nextElement })
    });
    return true;
  }
  
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
    
    // Add line decoration (without data-element attribute to remove visual indicators)
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: classes.join(' ')
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

// Debounce timer for auto-formatting
let autoFormatTimer: number | null = null;

// Auto-detect and format as user types with debouncing
const autoFormatPlugin = EditorView.updateListener.of((update: ViewUpdate) => {
  if (!update.docChanged && !update.transactions.some(tr => tr.effects.length > 0)) return;
  
  const elementTypes = update.state.field(elementTypeField);
  
  // Check if any manual element type changes were made
  let manualChanges = false;
  for (const tr of update.transactions) {
    for (const effect of tr.effects) {
      if (effect.is(setElementType)) {
        manualChanges = true;
        // If a character element was set manually, auto-capitalize
        if (effect.value.element === ScreenplayElement.Character) {
          const line = update.state.doc.line(effect.value.line);
          const lineText = line.text.trim();
          if (lineText && lineText !== lineText.toUpperCase()) {
            // Clear any pending timer
            if (autoFormatTimer !== null) {
              clearTimeout(autoFormatTimer);
              autoFormatTimer = null;
            }
            
            update.view.dispatch({
              changes: { from: line.from, to: line.to, insert: lineText.toUpperCase() }
            });
          }
        }
      }
    }
  }
  
  // Only auto-detect if no manual changes were made
  if (!manualChanges && update.docChanged) {
    // Clear existing timer
    if (autoFormatTimer !== null) {
      clearTimeout(autoFormatTimer);
    }
    
    // Set new timer for debounced auto-detection
    autoFormatTimer = setTimeout(() => {
      const effects: StateEffect<any>[] = [];
      
      // Check each changed line
      update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        const startLine = update.state.doc.lineAt(fromB).number;
        const endLine = Math.min(update.state.doc.lines, update.state.doc.lineAt(toB).number + 2);
        
        for (let i = startLine; i <= endLine; i++) {
          const line = update.state.doc.line(i);
          const currentElement = elementTypes.get(i);
          
          // Skip re-detection for character, parenthetical, and dialogue elements
          // This prevents them from changing back to action while typing
          if (currentElement === ScreenplayElement.Character ||
              currentElement === ScreenplayElement.Parenthetical ||
              currentElement === ScreenplayElement.Dialogue) {
            
            // Auto-capitalize character names as they're typed
            if (currentElement === ScreenplayElement.Character) {
              const lineText = line.text.trim();
              if (lineText && lineText !== lineText.toUpperCase()) {
                update.view.dispatch({
                  changes: { from: line.from, to: line.to, insert: lineText.toUpperCase() }
                });
              }
            }
            continue;
          }
          
          const prevElement = i > 1 ? elementTypes.get(i - 1) : undefined;
          const detectedElement = detectElementType(line.text, prevElement);
          
          if (currentElement !== detectedElement) {
            effects.push(setElementType.of({ line: i, element: detectedElement }));
          }
        }
      });
      
      if (effects.length > 0) {
        update.view.dispatch({ effects });
      }
      
      autoFormatTimer = null;
    }, 500); // 500ms debounce delay
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
        marginBottom: '0',
        marginLeft: '2.2in !important',
        marginRight: '0 !important',
        display: 'block',
        width: 'auto'
      },
      
      // Parentheticals
      '.cm-screenplay-parenthetical': {
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '1.8in !important',
        marginRight: '1.9in !important',
        paddingLeft: '0 !important',
        display: 'block',
        width: 'auto',
        boxSizing: 'border-box'
      },
      
      // Dialogue
      '.cm-screenplay-dialogue': {
        marginTop: '0',
        marginBottom: '12pt',
        marginLeft: '1.0in !important',
        marginRight: '1.0in !important',
        paddingLeft: '0 !important',
        display: 'block',
        width: 'auto',
        boxSizing: 'border-box'
      },
      
      // Transitions
      '.cm-screenplay-transition': {
        textTransform: 'uppercase',
        marginTop: '12pt',
        marginBottom: '12pt',
        marginLeft: '4.0in !important',
        marginRight: '0 !important',
        textAlign: 'right'
      },
      
      // Alignment classes - removed to prevent conflicts with margin positioning
    })
  ];
}