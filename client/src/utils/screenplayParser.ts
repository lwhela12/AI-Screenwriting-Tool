import { ScreenplayElement } from './screenplayPDF';

export interface ParseOptions {
  strictMode?: boolean; // If true, enforces stricter parsing rules
}

export class ScreenplayParser {
  private static readonly SCENE_HEADING_PREFIXES = [
    'INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.', 'E/I.',
    'INT ', 'EXT ', 'INT./EXT ', 'EXT./INT ', 'I/E ', 'E/I '
  ];
  
  private static readonly TRANSITIONS = [
    'CUT TO:', 'FADE IN:', 'FADE OUT:', 'FADE TO:', 'DISSOLVE TO:',
    'MATCH CUT TO:', 'SMASH CUT TO:', 'TIME CUT TO:', 'INTERCUT:',
    'FADE TO BLACK:', 'FADE TO WHITE:', 'CUT TO BLACK:', 'END OF ACT',
    'CONTINUED:', 'MONTAGE:', 'SERIES OF SHOTS:', 'BACK TO:'
  ];

  private static readonly EXTENSIONS = [
    '(V.O.)', '(O.S.)', '(O.C.)', '(CONT\'D)', '(CONT.)', 
    '(V.O)', '(O.S)', '(O.C)', '(CONTD)', '(CONT)', '(VO)', '(OS)', '(OC)'
  ];

  static parse(scriptText: string, options: ParseOptions = {}): ScreenplayElement[] {
    const lines = scriptText.split('\n');
    const elements: ScreenplayElement[] = [];
    let inDialogue = false;
    let lastCharacter = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        inDialogue = false;
        continue;
      }

      // Check for scene heading
      if (this.isSceneHeading(trimmedLine)) {
        elements.push({ type: 'scene-heading', text: trimmedLine.toUpperCase() });
        inDialogue = false;
        continue;
      }

      // Check for transition
      if (this.isTransition(trimmedLine)) {
        elements.push({ type: 'transition', text: trimmedLine.toUpperCase() });
        inDialogue = false;
        continue;
      }

      // Check for parenthetical
      if (this.isParenthetical(trimmedLine) && inDialogue) {
        elements.push({ type: 'parenthetical', text: trimmedLine });
        continue;
      }

      // Check for character name - more flexible detection
      if (trimmedLine === trimmedLine.toUpperCase() && 
          trimmedLine.length > 1 && 
          trimmedLine.length < 35 &&
          !this.isSceneHeading(trimmedLine) &&
          !this.isTransition(trimmedLine) &&
          !this.isParenthetical(trimmedLine)) {
        
        // Additional check: if previous line was empty or action, this might be a character
        const prevElement = elements[elements.length - 1];
        if (!prevElement || prevElement.type === 'action' || prevElement.type === 'scene-heading' || prevElement.type === 'transition') {
          lastCharacter = this.cleanCharacterName(trimmedLine);
          elements.push({ type: 'character', text: lastCharacter });
          inDialogue = true;
          continue;
        }
      }

      // If we're in dialogue mode, treat non-empty lines as dialogue
      if (inDialogue && trimmedLine) {
        elements.push({ type: 'dialogue', text: trimmedLine });
        continue;
      }

      // Everything else is action
      elements.push({ type: 'action', text: trimmedLine });
      inDialogue = false;
    }

    return elements;
  }

  private static isSceneHeading(line: string): boolean {
    const upperLine = line.toUpperCase();
    return this.SCENE_HEADING_PREFIXES.some(prefix => upperLine.startsWith(prefix));
  }

  private static isTransition(line: string): boolean {
    const upperLine = line.toUpperCase();
    return this.TRANSITIONS.includes(upperLine) || 
           (upperLine.endsWith(':') && upperLine === line && line.length < 20);
  }

  private static isParenthetical(line: string): boolean {
    return line.startsWith('(') && line.endsWith(')');
  }

  private static isCharacterName(trimmedLine: string, originalLine: string): boolean {
    // Character names are typically:
    // 1. In ALL CAPS
    // 2. Centered (have significant leading whitespace)
    // 3. Not too long (less than 35 characters)
    // 4. May have extensions like (V.O.) or (CONT'D)
    
    if (trimmedLine !== trimmedLine.toUpperCase()) return false;
    if (trimmedLine.length > 35) return false;
    if (this.isSceneHeading(trimmedLine)) return false;
    if (this.isTransition(trimmedLine)) return false;
    
    // Check if it's a valid character name pattern
    const nameWithoutExtension = this.removeExtensions(trimmedLine);
    
    // Must have at least 2 characters and not be just numbers or punctuation
    if (nameWithoutExtension.length < 2) return false;
    if (/^\d+$/.test(nameWithoutExtension)) return false;
    if (/^[^A-Z]+$/.test(nameWithoutExtension)) return false;
    
    // In the actual formatter, character names don't need specific indentation
    // They're detected by context and pattern
    return !nameWithoutExtension.includes('.') && 
           !nameWithoutExtension.includes('-') &&
           nameWithoutExtension.split(' ').every(word => word.length < 15);
  }

  private static isDialogueLine(line: string): boolean {
    // In the editor, dialogue is any non-empty line after a character name
    // We'll be more flexible here and just check if it has content
    return line.trim().length > 0;
  }

  private static cleanCharacterName(name: string): string {
    // Keep the name in uppercase but clean it up
    let cleaned = name.toUpperCase();
    
    // Remove any trailing colons
    if (cleaned.endsWith(':')) {
      cleaned = cleaned.slice(0, -1);
    }
    
    return cleaned.trim();
  }

  private static removeExtensions(name: string): string {
    let cleanedName = name;
    
    // Remove extensions
    this.EXTENSIONS.forEach(ext => {
      if (cleanedName.includes(ext)) {
        cleanedName = cleanedName.replace(ext, '').trim();
      }
    });
    
    return cleanedName;
  }

  // Advanced parsing method that handles multi-line dialogue and action
  static parseAdvanced(scriptText: string): ScreenplayElement[] {
    const elements = this.parse(scriptText);
    const mergedElements: ScreenplayElement[] = [];
    
    for (let i = 0; i < elements.length; i++) {
      const current = elements[i];
      const next = elements[i + 1];
      
      // Merge consecutive action lines
      if (current.type === 'action' && next?.type === 'action') {
        const mergedText = [current.text];
        let j = i + 1;
        
        while (j < elements.length && elements[j].type === 'action') {
          mergedText.push(elements[j].text);
          j++;
        }
        
        mergedElements.push({
          type: 'action',
          text: mergedText.join(' ')
        });
        
        i = j - 1; // Skip the merged elements
      } else {
        mergedElements.push(current);
      }
    }
    
    return mergedElements;
  }

  // Utility method to format raw text into screenplay format
  static formatRawText(rawText: string): string {
    const lines = rawText.split('\n');
    const formatted: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        formatted.push('');
        continue;
      }
      
      // Simple heuristics for formatting
      if (trimmed.toUpperCase() === trimmed && trimmed.length < 30) {
        // Likely a character name or scene heading
        if (this.SCENE_HEADING_PREFIXES.some(p => trimmed.toUpperCase().startsWith(p))) {
          formatted.push(trimmed.toUpperCase());
        } else {
          // Center character names (approximately)
          formatted.push(' '.repeat(25) + trimmed.toUpperCase());
        }
      } else if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        // Parenthetical
        formatted.push(' '.repeat(20) + trimmed);
      } else {
        // Action or dialogue - needs context to determine
        formatted.push(trimmed);
      }
    }
    
    return formatted.join('\n');
  }
}