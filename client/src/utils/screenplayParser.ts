import { ScreenplayElement } from './screenplayPDF';

/**
 * Infers screenplay elements from plain text.
 *
 * Two shapes of input are recognised:
 *
 *  - "paragraph" text, where each line is a whole element (what Final Draft
 *    and most editors put on the clipboard). Detected when any line is longer
 *    than a printed line could be, or when there are no blank lines at all.
 *  - "wrapped" text, such as a .txt export, where elements are separated by
 *    blank lines and long elements are hard-wrapped over several lines.
 *
 * Indentation, when present, is used as a further hint: deeply indented
 * capitals are character cues, indented text is dialogue.
 */
export class ScreenplayParser {
  private static readonly SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E|E\/I)[.\s]/i;

  private static readonly TRANSITIONS = new Set([
    'CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE OUT:', 'FADE TO:', 'FADE TO BLACK.', 'FADE TO BLACK:', 'FADE TO WHITE.',
    'DISSOLVE TO:', 'MATCH CUT TO:', 'SMASH CUT TO:', 'SMASH CUT:', 'JUMP CUT TO:', 'TIME CUT TO:', 'TIME CUT:',
    'INTERCUT:', 'INTERCUT WITH:', 'CUT TO BLACK.', 'CUT TO BLACK:', 'BACK TO:', 'WIPE TO:', 'IRIS IN:', 'IRIS OUT.',
    'END OF ACT', 'THE END'
  ]);

  static parse(scriptText: string): ScreenplayElement[] {
    const rawLines = scriptText.replace(/\r\n?/g, '\n').split('\n');
    const nonEmpty = rawLines.filter(l => l.trim().length > 0);
    if (nonEmpty.length === 0) return [];

    const hasBlank = rawLines.some((l, i) => l.trim().length === 0 && i > 0 && i < rawLines.length - 1);
    const maxLen = Math.max(...nonEmpty.map(l => l.trim().length));
    const paragraphMode = maxLen > 65 || !hasBlank;
    const hasIndent = nonEmpty.some(l => /^\s{4,}\S/.test(l));

    const elements: ScreenplayElement[] = [];
    let prev: ScreenplayElement['type'] | null = null;
    let inDialogue = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        inDialogue = false;
        prev = null;
        continue;
      }
      const indent = line.length - line.trimStart().length;
      const push = (type: ScreenplayElement['type'], text: string) => {
        elements.push({ type, text });
        prev = type;
      };

      if (this.isSceneHeading(trimmed)) {
        push('scene-heading', trimmed.toUpperCase());
        inDialogue = false;
        continue;
      }

      if (this.isTransition(trimmed)) {
        push('transition', trimmed.toUpperCase());
        inDialogue = false;
        continue;
      }

      if (this.isParenthetical(trimmed) && (prev === 'character' || prev === 'dialogue' || prev === 'parenthetical')) {
        push('parenthetical', trimmed);
        inDialogue = true;
        continue;
      }

      const cueAllowed = paragraphMode || !inDialogue || (hasIndent && indent >= 15);
      if (cueAllowed && this.isCharacterCue(trimmed, rawLines, i)) {
        push('character', this.cleanCharacterName(trimmed));
        inDialogue = true;
        continue;
      }

      if (inDialogue && (prev === 'character' || prev === 'parenthetical')) {
        push('dialogue', trimmed);
        if (paragraphMode) inDialogue = false;
        continue;
      }

      if (inDialogue && prev === 'dialogue' && !paragraphMode) {
        // Hard-wrapped continuation of the previous dialogue line.
        elements[elements.length - 1].text += ' ' + trimmed;
        continue;
      }

      if (hasIndent && indent >= 8 && (prev === 'dialogue' || prev === 'parenthetical')) {
        push('dialogue', trimmed);
        continue;
      }

      if (!paragraphMode && prev === 'action') {
        // Hard-wrapped continuation of the previous action paragraph.
        elements[elements.length - 1].text += ' ' + trimmed;
        continue;
      }

      push('action', trimmed);
      inDialogue = false;
    }

    return elements;
  }

  private static isSceneHeading(line: string): boolean {
    return this.SCENE_HEADING_RE.test(line);
  }

  private static isTransition(line: string): boolean {
    const upper = line.toUpperCase();
    if (upper !== line) return false;
    if (this.TRANSITIONS.has(upper)) return true;
    return /^[A-Z][A-Z .'-]*TO:$/.test(upper) && upper.length < 30;
  }

  private static isParenthetical(line: string): boolean {
    return line.startsWith('(') && line.endsWith(')');
  }

  /**
   * An all-caps line of reasonable length that is followed by something that
   * could be its dialogue. A capitalised action beat that is followed by a
   * blank line or by another capitalised line is left as action.
   */
  private static isCharacterCue(trimmed: string, lines: string[], index: number): boolean {
    if (trimmed !== trimmed.toUpperCase()) return false;
    if (trimmed.length < 2 || trimmed.length > 40) return false;
    if (/[.!?]$/.test(trimmed)) return false;
    const name = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!/[A-Z]/.test(name)) return false;

    for (let j = index + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) return false; // a blank line: nothing spoken follows
      if (this.isSceneHeading(next) || this.isTransition(next)) return false;
      if (next === next.toUpperCase() && !next.startsWith('(')) return false; // another cue or a caps beat
      return true;
    }
    return false;
  }

  private static cleanCharacterName(name: string): string {
    return name.replace(/:$/, '').trim().toUpperCase();
  }
}
