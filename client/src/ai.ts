import { useSyncExternalStore } from 'react';
import { Node as PMNode } from 'prosemirror-model';
import { SceneInfo } from './components/editor-v2/scenes';
import { aiAvailability, subscribeCapabilities, requestAI, AIAvailability } from './host';

/**
 * Writer-facing AI features that run on the Mac's own model (Apple
 * Intelligence). Everything here is scene-scoped so it fits the on-device
 * context window; whole-script features belong to a larger model.
 */

export function useAIAvailability(): AIAvailability {
  return useSyncExternalStore(subscribeCapabilities, aiAvailability, aiAvailability);
}

/**
 * Roughly what the on-device model can read alongside its instructions
 * (its window is about 4,000 tokens). A scene that still overflows is retried
 * with the shorter limit.
 */
export const SCENE_TEXT_LIMIT = 11000;
export const SCENE_TEXT_LIMIT_SHORT = 5500;

/**
 * A scene as readable text for a prompt: the heading, action, and each
 * speech as "NAME: line". Long scenes keep their opening and ending.
 */
export function sceneText(doc: PMNode, scene: SceneInfo, limit = SCENE_TEXT_LIMIT): string {
  const lines: string[] = [];
  let speaker: string | null = null;
  doc.nodesBetween(scene.from, scene.to, (node, _pos, parent) => {
    if (parent !== doc) return false;
    const text = node.textContent.trim();
    switch (node.type.name) {
      case 'character':
        speaker = text.replace(/\s*\((?:CONT'D|V\.O\.|O\.S\.|O\.C\.)\)\s*$/i, '');
        break;
      case 'parenthetical':
        if (text) lines.push(`${speaker ? speaker + ' ' : ''}${text}`);
        break;
      case 'dialogue':
        if (text) lines.push(`${speaker ? speaker + ': ' : ''}${text}`);
        break;
      case 'page_break':
        break;
      default:
        if (text) lines.push(text);
    }
    return false;
  });
  const full = lines.join('\n');
  if (full.length <= limit) return full;
  const head = Math.floor(limit * 0.7);
  const tail = limit - head;
  return `${full.slice(0, head).trimEnd()}\n[…]\n${full.slice(-tail).trimStart()}`;
}

export const SYNOPSIS_INSTRUCTIONS =
  'You write scene synopses for a screenwriter\'s own outline. ' +
  'Reply with a single short paragraph of at most two sentences and at most 40 words, in the present tense, ' +
  'saying what happens in the scene and who is in it. Lead with the most important turn, not the first thing that happens. ' +
  'No preamble, no headings, no quotation marks, no commentary, and do not say that it is a scene or a screenplay.';

/** Keep at most this many sentences from an answer that ran on. */
export const SYNOPSIS_MAX_SENTENCES = 3;

/** Tidy a model answer into a synopsis line. */
export function cleanSynopsis(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(synopsis|summary)\s*:\s*/i, '')
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim();
}

/** Cut an answer down to its first sentences (a safety net for a model that ignores the length). */
export function capSentences(text: string, max = SYNOPSIS_MAX_SENTENCES): string {
  const sentences = text.match(/[^.!?]+[.!?]+(?:["”’)]+)?(?=\s|$)/g);
  if (!sentences || sentences.length <= max) return text;
  return sentences
    .slice(0, max)
    .map(s => s.trim())
    .join(' ');
}

/** Ask the on-device model for a synopsis of one scene. */
export async function draftSynopsis(doc: PMNode, scene: SceneInfo): Promise<string> {
  const body = sceneText(doc, scene);
  if (!body.trim()) throw new Error('This scene has no text yet.');
  let answer: string;
  try {
    answer = await requestAI(SYNOPSIS_INSTRUCTIONS, body);
  } catch (err) {
    if (!/too long/i.test((err as Error).message)) throw err;
    answer = await requestAI(SYNOPSIS_INSTRUCTIONS, sceneText(doc, scene, SCENE_TEXT_LIMIT_SHORT));
  }
  const synopsis = capSentences(cleanSynopsis(answer));
  if (!synopsis) throw new Error('The model returned nothing.');
  return synopsis;
}
