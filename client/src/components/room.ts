import { Node as PMNode } from 'prosemirror-model';
import { scenesOf } from './editor-v2/scenes';
import { sceneText } from '../ai';
import { BeatBoardData } from './beats';
import { ChatTurn } from '../host';

/**
 * The Writers' Room: a conversation about the story with a model that has
 * read the script, the outline and the beat board. It proposes beats; the
 * writer keeps or dismisses them, sends them to the beat board or the
 * outline, and writes the scenes. It never writes dialogue or action.
 */

export type RoomMode = 'break' | 'ask' | 'alternatives' | 'pressure';

export interface RoomMessage {
  id: string;
  role: 'writer' | 'room';
  /** The full text; for the room's messages this includes the proposals block. */
  text: string;
  at: string;
  mode?: RoomMode;
}

export interface Proposal {
  id: string;
  kind: 'beat' | 'scene';
  title: string;
  text: string;
  /** A scene heading when the room proposed a scene. */
  heading?: string;
  status: 'open' | 'kept' | 'dismissed';
  /** Ordinal of the scene created from this proposal, to jump back to it. */
  sceneOrdinal?: number;
  messageId: string;
}

export interface RoomData {
  version: 1;
  messages: RoomMessage[];
  proposals: Proposal[];
}

export const ROOM_MODES: { id: RoomMode; label: string; hint: string }[] = [
  { id: 'break', label: 'Break the story', hint: 'Where it stands, what is missing, what could come next.' },
  { id: 'ask', label: 'Ask me questions', hint: 'The room asks; you answer. No proposals.' },
  { id: 'alternatives', label: 'Alternatives', hint: 'Three different versions of a beat you name.' },
  { id: 'pressure', label: 'Pressure test', hint: 'Where the structure gives, and what each choice costs.' }
];

export function emptyRoom(): RoomData {
  return { version: 1, messages: [], proposals: [] };
}

export function normalizeRoom(raw: unknown): RoomData {
  if (!raw || typeof raw !== 'object') return emptyRoom();
  const r = raw as Partial<RoomData>;
  return {
    version: 1,
    messages: Array.isArray(r.messages) ? r.messages.filter(m => m && typeof m.text === 'string' && (m.role === 'writer' || m.role === 'room')) : [],
    proposals: Array.isArray(r.proposals) ? r.proposals.filter(p => p && typeof p.title === 'string') : []
  };
}

export function newRoomId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${rand}`;
}

// ---- Prompts -----------------------------------------------------------------

const RULES =
  "You are the other person in a screenwriter's writers' room. The writer is breaking a story; you help them think, you do not write it. " +
  'Never write dialogue, action lines or scene text. Talk about their story in their terms, briefly and concretely, referring to scenes by number and heading. ' +
  'Be a colleague: direct, specific, willing to disagree, never flattering. Prefer questions and options to verdicts. Plain prose, short paragraphs, no headings, no bullet lists longer than four items. ' +
  'When you have concrete beats or scenes the writer might keep, put them at the very end of your reply in exactly this block and nowhere else:\n' +
  '```proposals\n[{"kind":"beat","title":"Short label","text":"One or two sentences on what happens and why it matters"},{"kind":"scene","title":"Short label","text":"…","heading":"INT. PLACE - NIGHT"}]\n```\n' +
  'Use "beat" unless the writer asks for scenes; a scene needs a heading. Propose at most five at a time, only when they are real proposals, and talk them through in the prose first. Nothing after the block.';

const MODE_RULES: Record<RoomMode, string> = {
  break: 'Mode: breaking the story. Say where the story stands, what is missing or thin, and offer a few directions for what comes next. Propose beats when they are concrete.',
  ask: 'Mode: questions. Do not propose anything and do not solve the story. Ask the writer the two or three most useful questions about what they have not decided yet, and say in a line why each matters. No proposals block.',
  alternatives: 'Mode: alternatives. For the beat or scene the writer names, offer three genuinely different versions as proposals, each with a different cost, and say in the prose which you would try first and why.',
  pressure: 'Mode: pressure test. Find where the structure gives: where an audience gets ahead of the story, what is set up and not paid off, what a choice costs the character, where the stakes go flat. Cite scenes. Do not propose unless asked.'
};

/** Everything the room knows about the script this turn. */
export function roomContext(doc: PMNode, beats: BeatBoardData | null, title: string): string {
  const scenes = scenesOf(doc);
  const parts: string[] = [`# ${title || 'Untitled script'}`];
  const numbered = scenes.filter(s => !s.opening);
  if (numbered.length) {
    parts.push('## Outline (the script as it stands)');
    parts.push(
      numbered
        .map((s, i) => {
          const bits = [`${i + 1}. ${s.heading || '(untitled scene)'}`];
          if (s.structure) bits.unshift(`[${s.structure}]`);
          if (s.synopsis) bits.push(`— ${s.synopsis}`);
          if (s.characters.length) bits.push(`(${s.characters.join(', ')})`);
          return bits.join(' ');
        })
        .join('\n')
    );
  } else {
    parts.push('## Outline\nNo scenes yet.');
  }
  if (beats && beats.beats.length) {
    parts.push('## Beat board (ideas not yet in the script)');
    parts.push(beats.beats.map(b => `- ${b.title || '(untitled)'}${b.text ? `: ${b.text}` : ''}`).join('\n'));
  }
  const body = scenes
    .map((s, i) => {
      const text = sceneText(doc, s, Number.MAX_SAFE_INTEGER);
      if (!text.trim()) return '';
      if (s.opening) return `OPENING\n${text}`;
      const n = numbered.indexOf(s) + 1;
      return `SCENE ${n} — ${s.heading || '(untitled)'}\n${text.split('\n').slice(1).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
  if (body) parts.push('## The script\n' + body);
  return parts.join('\n\n');
}

export function roomInstructions(mode: RoomMode, context: string): string {
  return `${RULES}\n\n${MODE_RULES[mode]}\n\n${context}`;
}

/** The conversation as turns for the model: recent history plus the writer's new message. */
export function roomTurns(messages: RoomMessage[], latest: string, limit = 24): ChatTurn[] {
  const recent = messages.slice(-limit).map<ChatTurn>(m => ({ role: m.role === 'writer' ? 'user' : 'model', text: m.text }));
  // The model expects the conversation to start with the writer.
  while (recent.length && recent[0].role === 'model') recent.shift();
  return [...recent, { role: 'user', text: latest }];
}

// ---- Replies ---------------------------------------------------------------

export interface ProposalDraft {
  kind: 'beat' | 'scene';
  title: string;
  text: string;
  heading?: string;
}

export interface ParsedReply {
  prose: string;
  proposals: ProposalDraft[];
  /** True while a proposals block has started but not closed (streaming). */
  pending: boolean;
}

const OPEN = /```\s*proposals\s*\n?/i;

/** Split a reply (complete or streaming) into prose and proposals. */
export function parseReply(text: string): ParsedReply {
  const open = text.search(OPEN);
  if (open < 0) return { prose: text.trim(), proposals: [], pending: false };
  const prose = text.slice(0, open).trim();
  const afterOpen = text.slice(open).replace(OPEN, '');
  const close = afterOpen.indexOf('```');
  if (close < 0) return { prose, proposals: [], pending: true };
  const body = afterOpen.slice(0, close);
  const tail = afterOpen.slice(close + 3).trim();
  return { prose: tail ? `${prose}\n\n${tail}`.trim() : prose, proposals: parseProposals(body), pending: false };
}

function parseProposals(body: string): ProposalDraft[] {
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return parsed
    .map((p: any) => {
      const heading = str(p?.heading).toUpperCase();
      return { kind: (p?.kind === 'scene' || heading ? 'scene' : 'beat') as 'beat' | 'scene', title: str(p?.title), text: str(p?.text), heading: heading || undefined };
    })
    .filter(p => p.title || p.text)
    .map(p => ({ ...p, title: p.title || p.text.slice(0, 60) }));
}

/** The synopsis a proposal becomes when it turns into a scene. */
export function proposalSynopsis(p: { title: string; text: string }): string {
  if (!p.text) return p.title;
  if (!p.title || p.text.toLowerCase().startsWith(p.title.toLowerCase())) return p.text;
  return `${p.title}. ${p.text}`;
}
