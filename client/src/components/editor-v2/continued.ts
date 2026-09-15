import { Node as PMNode } from 'prosemirror-model';

/**
 * Automatic "(CONT'D)".
 *
 * When a character speaks, is interrupted only by action (or other
 * non-dialogue elements), and then speaks again, Final Draft appends
 * "(CONT'D)" to the second cue. We compute this from the document rather
 * than storing it, so it stays correct as the script is edited. A new scene
 * heading ends the run: the first cue of a scene is never "continued".
 */

export const CONTD = "(CONT'D)";

const CONTD_RE = /\s*\(CONT'?D\.?\)\s*$/i;

/** The cue without any "(CONT'D)" suffix. */
export function stripContd(cue: string): string {
  return cue.replace(CONTD_RE, '').trim();
}

/** The speaker's name without extensions such as (V.O.) or (CONT'D). */
export function speakerName(cue: string): string {
  return cue.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function hasContd(cue: string): boolean {
  return CONTD_RE.test(cue);
}

/**
 * Indices of character elements that need an automatic "(CONT'D)" appended.
 * Cues that already carry one in their text are not included.
 */
export function continuedCues(doc: PMNode): Set<number> {
  const result = new Set<number>();
  let lastSpeaker: string | null = null;
  doc.forEach((node, _offset, index) => {
    const type = node.type.name;
    if (type === 'scene_heading') {
      lastSpeaker = null;
      return;
    }
    if (type !== 'character') return;
    const text = node.textContent;
    const name = speakerName(text);
    if (!name) return;
    if (name === lastSpeaker && !hasContd(text)) result.add(index);
    lastSpeaker = name;
  });
  return result;
}

/** The cue as displayed and printed. */
export function cueDisplayText(text: string, continued: boolean): string {
  if (!continued || hasContd(text)) return text;
  return text.trimEnd() ? `${text.trimEnd()} ${CONTD}` : text;
}
