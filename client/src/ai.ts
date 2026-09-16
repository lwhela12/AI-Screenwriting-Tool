import { useSyncExternalStore } from 'react';
import { Node as PMNode } from 'prosemirror-model';
import { SceneInfo } from './components/editor-v2/scenes';
import { aiAvailability, cloudAvailability, subscribeCapabilities, requestAI, AIAvailability, CloudAvailability } from './host';
import { scenesOf } from './components/editor-v2/scenes';

/**
 * Writer-facing AI features that run on the Mac's own model (Apple
 * Intelligence). Everything here is scene-scoped so it fits the on-device
 * context window; whole-script features belong to a larger model.
 */

export function useAIAvailability(): AIAvailability {
  return useSyncExternalStore(subscribeCapabilities, aiAvailability, aiAvailability);
}

export function useCloudAvailability(): CloudAvailability {
  return useSyncExternalStore(subscribeCapabilities, cloudAvailability, cloudAvailability);
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

// ---- Whole-script features (cloud) -------------------------------------------

/** The whole script as numbered scenes, for a model that can read all of it. */
export function scriptText(doc: PMNode): string {
  const scenes = scenesOf(doc);
  let n = 0;
  return scenes
    .map(scene => {
      const body = sceneText(doc, scene, Number.MAX_SAFE_INTEGER);
      if (scene.opening) return body ? `OPENING\n${body}` : '';
      n += 1;
      return `SCENE ${n} — ${scene.heading || '(untitled)'}\n${body.split('\n').slice(1).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export interface ContinuityFinding {
  title: string;
  characters: string[];
  detail: string;
  /** Scene numbers as printed in the prompt (1-based, opening material excluded) with the lines in question. */
  scenes: { scene: number; quote: string }[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CharacterFact {
  name: string;
  facts: { fact: string; scenes: number[] }[];
}

export interface ContinuityReport {
  findings: ContinuityFinding[];
  characters: CharacterFact[];
  /** Which model read the script. */
  model: string;
  at: Date;
}

export const CONTINUITY_INSTRUCTIONS =
  'You are a script supervisor checking a screenplay for continuity. Read the whole script, which arrives as numbered scenes. ' +
  'Report only what the text itself establishes; never invent facts, and quote the script exactly. ' +
  'Reply with one JSON object and nothing else, in this shape: ' +
  '{"characters":[{"name":"EVE","facts":[{"fact":"Lyra\'s daughter","scenes":[1,6]}]}],' +
  '"findings":[{"title":"short label","characters":["EVE"],"detail":"what conflicts and why it matters","scenes":[{"scene":3,"quote":"the exact line"},{"scene":9,"quote":"the exact line"}],"confidence":"high"}]}. ' +
  'Facts are things the script states about a character: relationships, age, job, possessions, injuries, knowledge, location, what they want. Keep each fact short. ' +
  'Findings are contradictions or slips: a name spelled two ways, an injury that moves or heals without explanation, a character who knows something before learning it, an object that appears after being lost, a time-of-day or location jump inside a scene, a relationship described two ways. ' +
  'Every finding must cite at least two scenes with exact quotes. Confidence is "high" for a plain contradiction, "medium" when it could be intentional, "low" for a hunch. Do not report style, pacing or opinions. Character names in upper case as they appear in the script.';

/** Turn the model's answer into a report, tolerating code fences and stray text around the JSON. */
export function parseContinuity(text: string, model: string): ContinuityReport {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a report.');
  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The model returned a report that could not be read.');
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);
  const findings: ContinuityFinding[] = (Array.isArray(parsed.findings) ? parsed.findings : [])
    .map((f: any) => ({
      title: str(f?.title) || 'Continuity',
      characters: Array.isArray(f?.characters) ? f.characters.map(str).filter(Boolean) : [],
      detail: str(f?.detail),
      scenes: (Array.isArray(f?.scenes) ? f.scenes : [])
        .map((s: any) => ({ scene: num(s?.scene), quote: str(s?.quote) }))
        .filter((s: any) => s.scene !== null) as { scene: number; quote: string }[],
      confidence: (['high', 'medium', 'low'].includes(f?.confidence) ? f.confidence : 'medium') as ContinuityFinding['confidence']
    }))
    .filter((f: ContinuityFinding) => f.detail || f.scenes.length);
  const characters: CharacterFact[] = (Array.isArray(parsed.characters) ? parsed.characters : [])
    .map((c: any) => ({
      name: str(c?.name).toUpperCase(),
      facts: (Array.isArray(c?.facts) ? c.facts : [])
        .map((f: any) => ({ fact: str(f?.fact), scenes: (Array.isArray(f?.scenes) ? f.scenes : []).map(num).filter((n: number | null) => n !== null) as number[] }))
        .filter((f: any) => f.fact)
    }))
    .filter((c: CharacterFact) => c.name);
  return { findings, characters, model, at: new Date() };
}

const continuityCache = new Map<string, ContinuityReport>();

/** The last report for this exact script text, if any. */
export function cachedContinuity(doc: PMNode): ContinuityReport | null {
  return continuityCache.get(scriptText(doc)) ?? null;
}

/** Read the whole script with the cloud model and report continuity findings. */
export async function continuityReport(doc: PMNode): Promise<ContinuityReport> {
  const text = scriptText(doc);
  if (!text.trim()) throw new Error('The script is empty.');
  const cached = continuityCache.get(text);
  if (cached) return cached;
  const answer = await requestAI(CONTINUITY_INSTRUCTIONS, text, { tier: 'cloud', json: true });
  const report = parseContinuity(answer, cloudAvailability().model || 'cloud');
  continuityCache.set(text, report);
  return report;
}
