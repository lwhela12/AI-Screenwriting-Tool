import { Node as PMNode } from 'prosemirror-model';
import { scenesOf, insertScene, SceneInfo } from './editor-v2/scenes';
import type { EditorView } from 'prosemirror-view';
import { Layout } from './editor-v2/pagination/layout';
import { Beat, BeatBoardData, BEAT_COLORS, GAP_COLOR, arrangeBeats, newBeatId, readingOrder } from './beats';
import { ChatTurn } from '../host';
import { pdfToText } from '../utils/pdfImport';
import { docxToText } from '../utils/docx';

/**
 * The Writers' Room: a conversation about the story with a model that has
 * read the script, the outline and the beat board. It proposes beats; the
 * writer keeps or dismisses them, sends them to the beat board or the
 * outline, and writes the scenes. It never writes dialogue or action.
 */

export type RoomMode = 'break' | 'analyze' | 'plot' | 'beats' | 'scenes';

/** What the script is, so the room thinks in the right shape and length. */
export type RoomFormat = 'feature' | 'tv-hour' | 'tv-half' | 'limited' | 'short';

export const FORMATS: { id: RoomFormat; label: string; shape: string; density: string; }[] = [
  {
    id: 'feature',
    label: 'Feature film',
    shape:
      'The script is a feature film. A feature runs 90 to 120 pages, a page being about a minute of screen time, and has 50 to 90 scenes. Think in sequences and acts; the writer decides the structure, but a feature has no act breaks to lean on and has to earn its ending in one sitting.',
    density: 'a 90 to 120 page feature has 50 to 90 scenes, so a paragraph of treatment usually needs three to six scenes and a sequence needs eight or more'
  },
  {
    id: 'tv-hour',
    label: 'TV drama (hour)',
    shape:
      'The script is an hour-long television drama episode. It runs 45 to 60 pages with 25 to 45 scenes: usually a teaser and four or five acts, each act ending on a turn strong enough to hold through a break. An A story, a B story and often a C story are braided together, and the episode answers its own question while moving the season along. Talk in acts and act breaks.',
    density: 'an hour drama episode of 45 to 60 pages has 25 to 45 scenes, so a paragraph of treatment usually needs two to five scenes; propose the act breaks where they fall'
  },
  {
    id: 'tv-half',
    label: 'TV comedy (half hour)',
    shape:
      'The script is a half-hour television comedy episode. It runs 22 to 35 pages: a cold open, two or three acts and often a tag; an A story and a B story; scenes are short and each turns on a joke or a reversal. Talk in acts, runners and buttons.',
    density: 'a half-hour episode of 22 to 35 pages has 15 to 30 scenes, so a paragraph of treatment usually needs two to four short scenes'
  },
  {
    id: 'limited',
    label: 'Limited series',
    shape:
      'The script is an episode of a limited series, fully serialized. It runs 50 to 60 pages; the season is the story and the episode is a chapter that ends on a question. Scenes can run longer than in network television, and setups may pay off episodes later.',
    density: 'a 50 to 60 page episode has 25 to 40 scenes, so a paragraph of treatment usually needs two to five scenes'
  },
  {
    id: 'short',
    label: 'Short film',
    shape: 'The script is a short film. It runs 5 to 20 pages: one situation, few locations, and one turn the whole film exists for. Everything that is not that turn is suspect.',
    density: 'a short of 5 to 20 pages has 5 to 20 scenes; do not pad it'
  }
];

/** Granularity is a reading lens, never a card quota. */
export type BeatDepth = 'overview' | 'turns' | 'scenes';
export type BeatPurpose = 'analyze' | 'develop';
export const BEAT_DEPTHS: { id: BeatDepth; label: string; instruction: string }[] = [
  { id: 'overview', label: 'Sequence overview', instruction: 'Summarize the major dramatic sequences. Group scenes only when they serve the same dramatic movement; do not sweep unrelated intercut threads into a contiguous scene range.' },
  { id: 'turns', label: 'Detailed dramatic turns', instruction: 'Identify each meaningful change in goal, information, stakes, power or character choice. A scene may carry several turns; several scenes may carry one continuous turn. Keep distinct turns separate.' },
  { id: 'scenes', label: 'Scene by scene', instruction: 'Work through every numbered scene in order. Give each scene its own card, or multiple cards when it contains distinct turns. Link only that scene on each card. Describe connective scenes honestly without inventing a reversal.' }
];
export interface BeatOptions { depth?: BeatDepth; purpose?: BeatPurpose }

/** Applies to every request, including a beat request made through freeform chat. */
export function beatInstructions(options: BeatOptions = {}): string {
  const depth = BEAT_DEPTHS.find(d => d.id === options.depth) ?? BEAT_DEPTHS[1];
  const purpose = options.purpose ?? 'analyze';
  return 'Beat settings: ' + depth.instruction + ' ' +
    'There is no target, minimum or maximum number of beats, no per-reply card quota, no beats-per-page ratio and no scene-count limit per beat. Let the requested granularity and the story determine the count. Never compress later material to fit a count. ' +
    'Use actual script scene numbers, not assumed format lengths. Link only scenes that substantiate the beat; links may be noncontiguous and may appear on more than one card. Check the described events against the supplied script, not memory of a film. ' +
    (purpose === 'analyze'
      ? 'Purpose: analyze the existing script. Treat the supplied script as the source of truth. Do not invent missing events or add rewrite suggestions as beats. Keep criticism and uncertainty in the prose, clearly separate from observed events. If no script is supplied, ask for one instead of fabricating an analysis. '
      : 'Purpose: develop the story. Use the treatment and conversation for proposed changes. Keep observed script events distinct from suggestions: every invented or not-yet-written beat must have gap: true and no scene links that imply it already happens. Explain uncertainty in the prose. ') +
    'Complete the requested scope when possible. If the response limit prevents completion, return a valid closed beats block for the completed portion and explain before it exactly where you stopped and what remains. Never claim partial coverage is complete.';
}

export const DEFAULT_FORMAT: RoomFormat = 'feature';

export function formatInfo(id: RoomFormat | undefined): (typeof FORMATS)[number] {
  return FORMATS.find(f => f.id === id) ?? FORMATS[0];
}

/** A treatment (or outline in prose) the writer brought into the room. */
export interface Treatment {
  /** Where it came from: a file name, or "Pasted". */
  name: string;
  text: string;
  at: string;
}

export interface RoomMessage {
  id: string;
  role: 'writer' | 'room';
  /** The full text; for the room's messages this includes the proposals block. */
  text: string;
  at: string;
  mode?: RoomMode;
  /** How many waiting proposals this reply placed in the outline with an accept block. */
  placed?: number;
}

export interface Proposal {
  id: string;
  kind: 'beat' | 'scene';
  title: string;
  text: string;
  /** A scene heading when the room proposed a scene. */
  heading?: string;
  /** The outline scene (its number) this one goes after; 0 puts it before the first. Absent: the end of the script. */
  after?: number;
  status: 'open' | 'kept' | 'dismissed';
  /** Ordinal of the scene created from this proposal, to jump back to it. */
  sceneOrdinal?: number;
  messageId: string;
}

/** One conversation with the room. Proposals belong to the conversation they came from. */
export interface Conversation {
  id: string;
  /** A short name and a line or two, written by a model once there is something to summarise. */
  title?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  messages: RoomMessage[];
  proposals: Proposal[];
}

export interface RoomData {
  version: 2;
  conversations: Conversation[];
  /** The conversation on screen. */
  activeId?: string;
  /** The treatment the room is plotting from, when the writer brought one. */
  treatment?: Treatment | null;
  /** What the script is; a feature when unset. */
  format?: RoomFormat;
  beatDepth?: BeatDepth;
  /** The conversation mode the writer chose; breaking the story when unset. */
  mode?: RoomMode;
}

/** The transient state of the Room view, kept while the writer is in another view. */
export interface RoomSession {
  /** Typed but not sent. */
  draft?: string;
  pane?: 'board' | 'proposals';
  /** Where the conversation was scrolled to, and which conversation that was. */
  scroll?: { conversationId: string | undefined; top: number };
}

export const ROOM_MODES: { id: RoomMode; label: string; hint: string; needsTreatment?: boolean; step?: boolean }[] = [
  { id: 'break', label: 'Break the story', hint: 'Develop it: where it is going, what is thin, alternatives, what you have not decided. Beats it lays out may include ones not written yet.' },
  { id: 'analyze', label: 'Analyze the script', hint: 'A breakdown of what is on the page: where it stands, where the structure gives. Beats it lays out describe only what is there.' },
  { id: 'plot', label: 'Plot the treatment', hint: 'Turn the treatment into scenes, in order, with headings and synopses.', needsTreatment: true },
  // Steps: reached from their buttons, not the mode tabs.
  { id: 'beats', label: 'Lay out the beats', hint: 'Read the script and the conversation and put the story on the board as beats.', step: true },
  { id: 'scenes', label: 'Break into scenes', hint: 'Turn the beats on the board into scene proposals for the outline.', step: true }
];

/** What the step buttons send. */
export const BEATS_REQUEST = 'Lay out the beats: read the script as it stands and what we have said, and put the story on the board as beats.';
export const SCENES_REQUEST = 'Break the beats on the board into scenes, in order, as scene proposals for the outline.';

/** Openers offered while the conversation is empty, by mode. */
export const STARTERS = ['What is this story about, and where is the arc going?', 'What is missing between the midpoint and the end?', 'Give me three different versions of the ending.', 'Ask me what I have not decided yet.'];
export const ANALYZE_STARTERS = ['Where does the story stand?', 'Where does the structure give?', 'What is set up and not paid off?', 'Where do the stakes go flat?'];
export const PLOT_STARTERS = ['Break the treatment into scenes, in order.', 'Carry on from where you stopped.', 'How many scenes does this treatment need?', 'Where does the treatment go soft?'];
export function startersFor(mode: RoomMode): string[] {
  return mode === 'plot' ? PLOT_STARTERS : mode === 'analyze' ? ANALYZE_STARTERS : STARTERS;
}
/** What the board may hold in each mode: only what is on the page, or beats not written yet. */
export function purposeFor(mode: RoomMode): BeatPurpose {
  return mode === 'analyze' ? 'analyze' : 'develop';
}

/** The message sent when the writer clicks "Plot it" on the treatment. */
export const PLOT_REQUEST = 'Break the treatment into scenes at the density of a finished feature, in order. Start from the beginning, or carry on from wherever the outline already reaches, and stop where fifteen scenes run out.';

export function emptyRoom(): RoomData {
  return { version: 2, conversations: [] };
}

function cleanMessages(raw: unknown): RoomMessage[] {
  return Array.isArray(raw) ? raw.filter(m => m && typeof m.text === 'string' && (m.role === 'writer' || m.role === 'room')) : [];
}

function cleanProposals(raw: unknown): Proposal[] {
  return Array.isArray(raw) ? raw.filter(p => p && typeof p.title === 'string') : [];
}

/**
 * Read stored room data of any version. Version 1 held a single
 * conversation as `messages` and `proposals`; it becomes the first entry of
 * the list. Empty conversations are dropped.
 */
export function normalizeRoom(raw: unknown): RoomData {
  if (!raw || typeof raw !== 'object') return emptyRoom();
  const r = raw as Record<string, unknown>;
  const t = r.treatment as Partial<Treatment> | undefined;
  const treatment: Treatment | null = t && typeof t === 'object' && typeof t.text === 'string' && t.text.trim() ? { name: typeof t.name === 'string' && t.name ? t.name : 'Treatment', text: t.text, at: typeof t.at === 'string' ? t.at : '' } : null;
  const format = FORMATS.some(f => f.id === r.format) ? (r.format as RoomFormat) : undefined;

  let conversations: Conversation[];
  if (Array.isArray(r.conversations)) {
    conversations = (r.conversations as Partial<Conversation>[])
      .filter(c => c && typeof c === 'object')
      .map(c => {
        const messages = cleanMessages(c.messages);
        return {
          id: typeof c.id === 'string' && c.id ? c.id : newRoomId('conv'),
          ...(typeof c.title === 'string' && c.title ? { title: c.title } : {}),
          ...(typeof c.summary === 'string' && c.summary ? { summary: c.summary } : {}),
          createdAt: typeof c.createdAt === 'string' ? c.createdAt : messages[0]?.at || '',
          updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : messages[messages.length - 1]?.at || '',
          messages,
          proposals: cleanProposals(c.proposals)
        };
      });
  } else {
    const messages = cleanMessages(r.messages);
    const proposals = cleanProposals(r.proposals);
    conversations =
      messages.length || proposals.length
        ? [{ id: newRoomId('conv'), createdAt: messages[0]?.at || '', updatedAt: messages[messages.length - 1]?.at || '', messages, proposals }]
        : [];
  }
  // Empty conversations are dropped, except the one on screen: a fresh one has to survive until its first message.
  conversations = conversations.filter(c => c.messages.length || c.proposals.length || c.id === r.activeId);
  const activeId = typeof r.activeId === 'string' && conversations.some(c => c.id === r.activeId) ? r.activeId : conversations[0]?.id;
  return {
    version: 2,
    conversations,
    ...(activeId ? { activeId } : {}),
    ...(treatment ? { treatment } : {}),
    ...(format ? { format } : {}),
    ...(BEAT_DEPTHS.some(d => d.id === r.beatDepth) ? { beatDepth: r.beatDepth as BeatDepth } : {}),
    ...(ROOM_MODES.some(m => m.id === r.mode && !m.step) ? { mode: r.mode as RoomMode } : {})
  };
}

export function activeConversation(room: RoomData): Conversation | undefined {
  return room.conversations.find(c => c.id === room.activeId) ?? room.conversations[0];
}

export function newConversation(): Conversation {
  const now = new Date().toISOString();
  return { id: newRoomId('conv'), createdAt: now, updatedAt: now, messages: [], proposals: [] };
}

/** The room with one conversation replaced (or added, when it is new) and made active. */
export function withConversation(room: RoomData, conversation: Conversation): RoomData {
  const exists = room.conversations.some(c => c.id === conversation.id);
  const conversations = exists ? room.conversations.map(c => (c.id === conversation.id ? conversation : c)) : [conversation, ...room.conversations];
  return { ...room, conversations, activeId: conversation.id };
}

/** Patch one conversation without changing which is active. */
export function patchConversation(room: RoomData, id: string, changes: Partial<Conversation>): RoomData {
  return { ...room, conversations: room.conversations.map(c => (c.id === id ? { ...c, ...changes } : c)) };
}

/** The name shown for a conversation before (or without) a model's title. */
export function conversationLabel(c: Conversation): string {
  if (c.title) return c.title;
  const first = c.messages.find(m => m.role === 'writer')?.text.trim();
  if (!first) return 'New conversation';
  return first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first;
}

// ---- Summaries ----------------------------------------------------------------

export const SUMMARY_INSTRUCTIONS =
  "You name and summarise a screenwriter's conversation with their writers' room so they can find it again. " +
  'Reply with exactly two lines. Line one: "Title: " and a name of at most six words, specific to what was discussed (a character, a scene, a problem), no quotation marks. ' +
  'Line two: "Summary: " and one or two sentences, at most 45 words, in the present tense, saying what was worked out and what is still open. Nothing else.';

/** The conversation's recent turns, cut to what a small model can read. */
export function summaryPrompt(c: Conversation, limit = 3500): string {
  const turns = c.messages.slice(-8).map(m => `${m.role === 'writer' ? 'WRITER' : 'ROOM'}: ${parseReply(m.text).prose}`);
  let text = turns.join('\n\n');
  if (text.length > limit) text = text.slice(0, Math.floor(limit * 0.4)).trimEnd() + '\n[…]\n' + text.slice(-Math.floor(limit * 0.6)).trimStart();
  return (c.summary ? `Earlier in this conversation: ${c.summary}\n\n` : '') + text;
}

export function parseSummary(text: string): { title: string; summary: string } {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const grab = (label: RegExp) => (lines.find(l => label.test(l)) || '').replace(label, '').replace(/^["“'‘]+|["”'’.]+$/g, '').trim();
  let title = grab(/^\**title\**\s*[:：]\**\s*/i);
  let summary = grab(/^\**summary\**\s*[:：]\**\s*/i);
  if (!title && !summary && lines.length) {
    title = lines[0].replace(/^["“'‘]+|["”'’.]+$/g, '');
    summary = lines.slice(1).join(' ');
  }
  if (title.split(/\s+/).length > 8) title = title.split(/\s+/).slice(0, 8).join(' ');
  return { title, summary };
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** File types the treatment importer reads, for the file picker. */
export const TREATMENT_FILE_TYPES = '.txt,.md,.markdown,.fountain,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Read a treatment from a file the writer chose: plain text, Markdown, Fountain, a PDF or a Word document. */
export async function treatmentFromFile(file: File): Promise<Treatment> {
  const name = file.name;
  const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
  const isDocx = /\.docx$/i.test(name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.doc$/i.test(name)) throw new Error('Old Word files (.doc) cannot be read. Save it as .docx from Word and try again.');
  const text = isPdf ? await pdfToText(await file.arrayBuffer()) : isDocx ? await docxToText(await file.arrayBuffer()) : await file.text();
  if (!text.trim()) throw new Error(isPdf ? 'No text could be read from that PDF (it may be a scan).' : 'That file is empty.');
  return { name, text: text.replace(/\r\n?/g, '\n').trim(), at: new Date().toISOString() };
}

export function newRoomId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${rand}`;
}

// ---- Prompts -----------------------------------------------------------------

const RULES =
  "You are the other person in a screenwriter's writers' room. The writer is breaking a story; you help them think, you do not write it. " +
  'Never write dialogue, action lines or scene text. Talk about their story in their terms, briefly and concretely, referring to scenes by number and heading, and to where things fall by page when it matters (a page is about a minute of screen time). ' +
  'Be a colleague: direct, specific, willing to disagree, never flattering. Prefer questions and options to verdicts. Plain prose, short paragraphs, no headings, no bullet lists longer than four items. ' +
  'Talk first. The board and the outline are the writer\'s; do not put beats or scenes on them unless the writer asks or the mode calls for it. When you do, use exactly one of these blocks at the very end of your reply and nowhere else:\n' +
  'Scenes for the outline:\n```proposals\n[{"kind":"scene","title":"Short label","text":"One or two sentences on what happens and what it turns","heading":"INT. PLACE - NIGHT","after":12},{"kind":"beat","title":"Short label","text":"…"}]\n```\n' +
  'Beats for the board:\n```beats\n[{"ref":"b2","title":"Short label","text":"What happens and what it changes","scenes":[3,4]},{"title":"A new beat","text":"…","gap":true}]\n```\n' +
  'Placing proposals that are waiting:\n```accept\n["p1","p3"]\n```\n' +
  'A scene goes where it belongs in the story, not only at the end: give it "after", the number of the outline scene it follows (0 to put it before the first), and leave "after" out only for a scene that comes after the last one. Scenes with the same "after" land in the order you list them. ' +
  'Scenes you propose do not go into the outline by themselves: they wait in a pane, listed below under "Proposals waiting", until the writer places them there or asks you to. ' +
  'When the writer asks you to move, add or send waiting proposals into the outline, or agrees when you offer, do not propose them again: use the accept block with their labels (or ["all"] for every one waiting), and each becomes a scene in the outline, where its "after" puts it (or at the end), with its heading and a synopsis. To place one somewhere else than it was proposed, give the entry as {"label":"p1","after":12}. ' +
  'A proposal the writer has already placed or dismissed is not listed and cannot be accepted; if nothing is waiting, propose the scenes with a proposals block instead. ' +
  'A beat is a unit of the story (something that has to happen and what it changes), with no place or time; a scene is a unit of the script, one heading, one place, one stretch of time. ' +
  'The beats block is the board in story order: give an existing beat its label (ref, as listed in the board) to change or move it, leave ref out for a new one, list scenes (their numbers in the outline) that carry it, and set gap when the script does not have it yet. Beats you leave out stay as they are. You never delete a beat; say which the writer should drop. ' +
  'Talk the proposals or beats through in the prose first, briefly. Nothing after the block. ' +
  'When the conversation has changed the story, say so and offer to carry the change onto the board (beats) or into the outline (scenes); when the writer agrees, or asks outright, do it in that reply with the block: proposals for new scenes, accept for scenes already waiting.';

const MODE_RULES: Record<RoomMode, string | ((format: (typeof FORMATS)[number]) => string)> = {
  break:
    'Mode: breaking the story. The writer is developing the story with you. Talk about where it is going: what it is about, the arc, what is missing or thin, and directions for what comes next. ' +
    'When the writer names a beat or scene and wants alternatives, offer three genuinely different versions as proposals, each with a different cost, and say which you would try first and why. ' +
    'When the writer asks to be asked, do not solve the story: ask the two or three most useful questions about what they have not decided yet, and say in a line why each matters. ' +
    'Otherwise, no proposals or beats blocks unless the writer asks for beats or scenes in this message.',
  analyze:
    'Mode: analyzing the script. The writer wants a breakdown of what is on the page, not new material. Describe the story as it stands, then find where the structure gives: where an audience gets ahead of the story, what is set up and not paid off, what a choice costs the character, where the stakes go flat. ' +
    'Cite scenes and pages. Do not invent events, and do not pitch rewrites as if they were on the page; keep any suggestion brief and clearly marked as one. No proposals or beats blocks unless asked.',
  beats:
    'Mode: laying out the beats. Apply the beat settings below to the requested scope, in story order. Each card says what happens and what it changes, with accurate scene references. ' +
    'If the board already has beats, use refs to update the same story units, add genuinely distinct units, and never delete existing cards. Do not change the meaning of a sequence summary just to reuse its ref for an unrelated detail. ' +
    'Before the block, briefly explain the granularity, coverage, and any uncertainty. When old sequence summaries remain alongside new detailed cards, identify them as summaries rather than counting them as additional distinct turns.',
  scenes: format =>
    'Mode: breaking into scenes. Turn the beats on the board (in their order, or the ones the writer names) into the scenes that tell them: a proposals block of "scene" entries with a heading (INT./EXT., place, time) and one or two sentences saying what happens and what it turns, in story order. ' +
    'A scene is one heading, one place, one continuous stretch of time; a beat usually needs more than one, and one scene can carry parts of two beats. ' +
    `Plot at the density of a finished script in this format: ${format.density}. Skip what the outline already covers. Propose up to fifteen scenes per turn, name the beat each one serves in its text, and say where you stopped so the writer can ask for the rest.`,
  plot: format =>
    'Mode: plotting from the treatment. The writer has brought a treatment and wants it broken into scenes. Work through the treatment in order and propose the scenes that tell it: every proposal is a "scene" with a heading (INT./EXT., place, time) and a text of one or two sentences saying what happens and what it turns. ' +
    'A scene is one scene heading in the script: one place, one continuous stretch of time. Start a new scene whenever the place or the time changes, or when the story cuts to someone else. Do not fold several of those into one proposal, and do not summarise. ' +
    `Plot at the density of a finished script in this format: ${format.density}. ` +
    'Before the first scene, say in a line how many scenes the whole treatment will need at that density, and each turn say which stretch of the treatment these scenes cover and where you stopped, so the writer can ask for the next stretch. ' +
    'Propose up to fifteen scenes per turn, in story order, and cover only as much of the treatment as fifteen scenes properly tell. Never make scenes bigger to reach the end sooner; if the treatment is not finished, stop and say so. ' +
    'Compare the treatment with the outline as it stands: skip what the script already covers, and pick up where it stops. ' +
    'Where the treatment is vague, say what is not decided, propose a scene anyway and mark it a guess. Keep the prose short: the proposals are the work.'
};

function lengthLabel(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole && rest) return `${whole} ${rest}/8`;
  if (whole) return `${whole}`;
  return `${rest}/8`;
}

/**
 * A scene's text for the model, one element per line, speeches as
 * `NAME: line`. With a layout, `[p. N]` marks where each page begins.
 */
export function sceneTextForRoom(doc: PMNode, scene: SceneInfo, layout?: Layout): string {
  const lines: string[] = [];
  let speaker: string | null = null;
  let page = 0;
  doc.forEach((node, offset, index) => {
    if (offset < scene.from || offset >= scene.to) return;
    const el = layout?.elements[index];
    if (el && el.page !== page) {
      page = el.page;
      lines.push(`[p. ${page}]`);
    }
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
  });
  return lines.join('\n');
}

/**
 * Everything the room knows about the script this turn. With a layout the
 * model also learns the page count, where each scene starts and how long it
 * runs, and where every page begins in the text.
 */
export function roomContext(doc: PMNode, beats: BeatBoardData | null, title: string, treatment?: Treatment | null, layout?: Layout, proposals: Proposal[] = []): string {
  const scenes = scenesOf(doc, layout);
  const parts: string[] = [`# ${title || 'Untitled script'}`];
  if (layout) {
    const pages = layout.pages.length;
    parts.push(
      `${pages} ${pages === 1 ? 'page' : 'pages'} as formatted (Courier 12 on US Letter; a page is about a minute of screen time). ` +
        'The outline gives the page each scene starts on and its length in pages and eighths; in the script, [p. N] marks where page N begins.'
    );
  }
  if (treatment && treatment.text.trim()) {
    parts.push(`## Treatment (${treatment.name})\nThe story as the writer has planned it in prose. The script below may not cover it yet.\n\n${treatment.text.trim()}`);
  }
  const numbered = scenes.filter(s => !s.opening);
  if (numbered.length) {
    parts.push('## Outline (the script as it stands)');
    parts.push(
      numbered
        .map((s, i) => {
          const bits = [`${i + 1}. ${s.heading || '(untitled scene)'}`];
          if (layout) bits.push(`(p. ${s.page}${s.eighths ? `, ${lengthLabel(s.eighths)} ${s.eighths === 8 ? 'page' : 'pages'}` : ''})`);
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
    parts.push('## Beat board (the story in beats, in the writer\'s reading order; refer to a beat by its label)');
    parts.push(boardContext(beats));
  }
  const waiting = proposalsContext(proposals);
  if (waiting) {
    parts.push('## Proposals waiting (scenes you proposed that the writer has not placed in the outline or dismissed; refer to one by its label, and place them with an accept block when asked)');
    parts.push(waiting);
  }
  const body = scenes
    .map(s => {
      const text = sceneTextForRoom(doc, s, layout);
      if (!text.trim()) return '';
      if (s.opening) return `OPENING\n${text}`;
      const n = numbered.indexOf(s) + 1;
      // The heading is in the outline; drop it from the body (it is the first line after any page marker).
      const bodyLines = text.split('\n');
      const headingAt = bodyLines.findIndex(l => !l.startsWith('[p. '));
      if (headingAt >= 0) bodyLines.splice(headingAt, 1);
      return `SCENE ${n} — ${s.heading || '(untitled)'}\n${bodyLines.join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
  if (body) parts.push('## The script\n' + body);
  return parts.join('\n\n');
}

export function roomInstructions(mode: RoomMode, context: string, format: RoomFormat = DEFAULT_FORMAT, beatOptions: BeatOptions = {}): string {
  const info = formatInfo(format);
  const rule = MODE_RULES[mode];
  return `${RULES}\n\nFormat: ${mode === 'beats' ? info.label : info.shape}\n\n${typeof rule === 'function' ? rule(info) : rule}\n\n${beatInstructions(beatOptions)}\n\n${context}`;
}

/** The conversation as turns for the model: recent history plus the writer's new message. */
export function roomTurns(messages: RoomMessage[], latest: string, limit = 24): ChatTurn[] {
  const recent = messages.slice(-limit).map<ChatTurn>(m => ({ role: m.role === 'writer' ? 'user' : 'model', text: m.text }));
  // The model expects the conversation to start with the writer.
  while (recent.length && recent[0].role === 'model') recent.shift();
  return [...recent, { role: 'user', text: latest }];
}

/** The board for the model: labelled b1, b2… in reading order, so it can refer back to a card. */
export function boardContext(board: BeatBoardData): string {
  return readingOrder(board.beats)
    .map((b, i) => {
      const bits = [`b${i + 1}. ${b.title || '(untitled)'}`];
      if (b.text) bits.push(`— ${b.text}`);
      if (b.scenes?.length) bits.push(`(scenes ${b.scenes.join(', ')})`);
      if (b.gap) bits.push('[gap: not in the script yet]');
      return bits.join(' ');
    })
    .join('\n');
}

/** The open proposals in the pane for the model: labelled p1, p2… in pane order, so it can accept one by label. */
export function proposalsContext(proposals: Proposal[]): string {
  return openProposals(proposals)
    .map((p, i) => {
      const bits = [`p${i + 1}.`];
      if (p.heading) bits.push(p.heading);
      bits.push(p.heading ? `— ${p.title}` : p.title);
      if (p.text && p.text !== p.title) bits.push(`— ${p.text}`);
      if (p.after !== undefined) bits.push(`(${p.after === 0 ? 'before scene 1' : `after scene ${p.after}`})`);
      return bits.join(' ');
    })
    .join('\n');
}

function openProposals(proposals: Proposal[]): Proposal[] {
  return proposals.filter(p => p.status === 'open');
}

/**
 * The waiting proposals an accept block names, in the order it names them
 * (or pane order for "all"). Labels are the ones the model was shown
 * (p1, p2…); a title also matches, so a model that names a scene instead of
 * its label still places it. Unknown labels are ignored.
 */
export function acceptedProposals(proposals: Proposal[], accept: AcceptBlock): Proposal[] {
  const open = openProposals(proposals);
  if (accept === 'all') return open;
  const chosen: Proposal[] = [];
  for (const entry of accept) {
    const label = entry.label.trim().toLowerCase();
    const byLabel = /^p?(\d+)$/.exec(label);
    const found = byLabel ? open[Number(byLabel[1]) - 1] : open.find(p => p.title.toLowerCase() === label || (p.heading || '').toLowerCase() === label);
    if (found && !chosen.some(c => c.id === found.id)) chosen.push(entry.after !== undefined ? { ...found, after: entry.after } : found);
  }
  return chosen;
}

/** One step of placing proposals: which item, the scene number it follows, and the number it ends up with. */
export interface Placement {
  index: number;
  /** The outline scene (its number, in the outline before any of these land) the new scene follows; 0 is the start. */
  after: number;
  /** The new scene's number once every item has landed. */
  number: number;
}

/**
 * Proposals become scenes where their `after` puts them (the end when it is
 * absent), each with its heading and a synopsis. Returns the proposals as
 * kept, with the ordinal of the scene each became.
 */
export function placeScenes(view: EditorView, items: Proposal[]): Proposal[] {
  const numbered = () => scenesOf(view.state.doc).filter(s => !s.opening);
  const plan = placementPlan(items, numbered().length);
  for (const step of plan) {
    const p = items[step.index];
    // Scene 0 is the start of the script: after any opening material, else the very top.
    const afterOrdinal = step.after === 0 ? (scenesOf(view.state.doc)[0]?.opening ? 0 : -1) : numbered()[step.after - 1].ordinal;
    insertScene(view, afterOrdinal, p.heading || '', proposalSynopsis(p));
  }
  const finalNumbered = numbered();
  const ordinals = new Map(plan.map(step => [step.index, finalNumbered[step.number - 1]?.ordinal]));
  return items.map((p, index) => ({ ...p, status: 'kept' as const, sceneOrdinal: ordinals.get(index) }));
}

/** Where a proposal will land, for the writer: "After scene 12", "Before scene 1", "At the end". */
export function placementLabel(after: number | undefined, count: number): string {
  if (after === undefined || after >= count) return 'At the end';
  if (after <= 0) return 'Before scene 1';
  return `After scene ${after}`;
}

/**
 * The order to insert proposals so each lands where its `after` says, given
 * an outline of `count` scenes. Later anchors go first, and items sharing an
 * anchor go in reverse, so every insertion happens after a scene whose
 * number the insertions so far have not moved. An item with no `after`, or
 * one beyond the outline, goes at the end.
 */
export function placementPlan(items: { after?: number }[], count: number): Placement[] {
  const anchored = items.map((item, index) => {
    const after = item.after === undefined || !Number.isFinite(item.after) ? count : Math.max(0, Math.min(count, Math.floor(item.after)));
    return { index, after };
  });
  const order = [...anchored].sort((a, b) => b.after - a.after || b.index - a.index);
  return order.map((step, i) => ({ ...step, number: step.after + 1 + (order.length - 1 - i) }));
}

// ---- The board, edited by the room ----------------------------------------

export interface BeatEntry {
  /** Label of an existing beat (b3), as given in the board context; absent for a new one. */
  ref?: string;
  title: string;
  text: string;
  scenes?: number[];
  gap?: boolean;
}

/**
 * Apply a beats block to the board. Existing beats named by label are
 * updated, new ones are added, nothing is deleted. The cards are re-laid
 * out in the block's order when the order changed or beats were added;
 * a pure rewording keeps the writer's arrangement.
 */
export function applyBeatSheet(board: BeatBoardData, entries: BeatEntry[], referenceBoard: BeatBoardData = board): { board: BeatBoardData; changedIds: string[] } {
  const ordered = readingOrder(board.beats);
  const byLabel = new Map<string, string>(readingOrder(referenceBoard.beats).map((b, i) => [`b${i + 1}`, b.id]));
  const beats = board.beats.map(b => ({ ...b }));
  const changed: string[] = [];
  const orderIds: string[] = [];
  let added = false;
  for (const e of entries) {
    const id = e.ref ? byLabel.get(e.ref.trim().toLowerCase()) : undefined;
    const existing = id ? beats.find(b => b.id === id) : undefined;
    if (id && !existing) continue; // The writer deleted this card while the request was running.
    if (existing) {
      const next: Beat = {
        ...existing,
        title: e.title || existing.title,
        text: e.text || existing.text,
        ...(e.scenes ? { scenes: e.scenes } : {}),
        gap: !!e.gap,
        color: e.gap && existing.color !== GAP_COLOR ? GAP_COLOR : !e.gap && existing.gap && existing.color === GAP_COLOR ? BEAT_COLORS[0] : existing.color
      };
      if (!next.gap) delete next.gap;
      if (next.title !== existing.title || next.text !== existing.text || JSON.stringify(next.scenes) !== JSON.stringify(existing.scenes) || !!next.gap !== !!existing.gap) {
        changed.push(existing.id);
        Object.assign(existing, next);
      }
      orderIds.push(existing.id);
    } else {
      const beat: Beat = { id: newBeatId(), title: e.title, text: e.text, color: e.gap ? GAP_COLOR : BEAT_COLORS[0], x: 0, y: 0, ...(e.scenes?.length ? { scenes: e.scenes } : {}), ...(e.gap ? { gap: true } : {}) };
      beats.push(beat);
      changed.push(beat.id);
      orderIds.push(beat.id);
      added = true;
    }
  }
  const before = ordered.map(b => b.id).filter(id => orderIds.includes(id));
  const after = orderIds.filter(id => before.includes(id));
  const reordered = before.some((id, i) => id !== after[i]);
  return { board: { version: 2, beats: added || reordered ? arrangeBeats(beats, orderIds) : beats }, changedIds: changed };
}

// ---- Replies ---------------------------------------------------------------

export interface ProposalDraft {
  kind: 'beat' | 'scene';
  title: string;
  text: string;
  heading?: string;
  /** The outline scene (its number) this one goes after; 0 puts it before the first. Absent: the end of the script. */
  after?: number;
}

/** One entry of an accept block: a label (p1, p2…) or title, and where the scene goes when the block says so. */
export interface AcceptEntry {
  label: string;
  after?: number;
}

/** What an accept block asks for: every waiting proposal, or some by label. */
export type AcceptBlock = 'all' | AcceptEntry[];

export interface ParsedReply {
  prose: string;
  proposals: ProposalDraft[];
  /** Beats for the board, when the reply carried a beats block. */
  beats: BeatEntry[];
  /** Waiting proposals to place in the outline, when the reply carried an accept block. */
  accept?: AcceptBlock;
  /** True while a block has started but not closed (streaming). */
  pending: boolean;
  /** A block the app could not read, verbatim, so the writer can see what the room tried to do. */
  unreadable?: string;
}

const OPEN = /```\s*(proposals|beats|accept|json)\s*\n?/i;

/** What a block was meant to be when the model fenced it as plain JSON. */
export type BlockHint = 'beats' | 'proposals';

/**
 * Split a reply (complete or streaming) into prose, proposals and beats.
 * `hint` says what a bare JSON block means (the step that was running).
 * A block that could not be read is kept in `unreadable` so the app can show it.
 */
export function parseReply(text: string, hint: BlockHint = 'proposals'): ParsedReply {
  const result: ParsedReply = { prose: '', proposals: [], beats: [], pending: false };
  const proseParts: string[] = [];
  let rest = text;
  for (;;) {
    const match = OPEN.exec(rest);
    if (!match) {
      proseParts.push(rest);
      break;
    }
    proseParts.push(rest.slice(0, match.index));
    const fence = match[1].toLowerCase();
    const afterOpen = rest.slice(match.index + match[0].length);
    const close = afterOpen.indexOf('```');
    if (close < 0) {
      result.pending = true;
      break;
    }
    const body = afterOpen.slice(0, close);
    if (fence === 'accept') {
      const accept = parseAccept(body);
      if (accept) result.accept = accept === 'all' || result.accept === 'all' ? 'all' : [...(result.accept ?? []), ...accept];
      else if (body.trim()) result.unreadable = (result.unreadable ? result.unreadable + '\n\n' : '') + `\`\`\`accept\n${body.trim()}\n\`\`\``;
      rest = afterOpen.slice(close + 3);
      continue;
    }
    const kind = fence === 'json' ? guessBlockKind(body, hint) : (fence as BlockHint);
    const items = kind === 'proposals' ? parseProposals(body) : parseBeats(body);
    if (items.length) {
      if (kind === 'proposals') result.proposals.push(...(items as ProposalDraft[]));
      else result.beats.push(...(items as BeatEntry[]));
    } else if (body.trim()) {
      result.unreadable = (result.unreadable ? result.unreadable + '\n\n' : '') + `\`\`\`${fence}\n${body.trim()}\n\`\`\``;
    }
    rest = afterOpen.slice(close + 3);
  }
  result.prose = proseParts
    .map(p => p.trim())
    .filter(Boolean)
    .join('\n\n');
  return result;
}

/** A bare JSON block: beats if its entries look like beats, proposals if they look like scenes, else the hint. */
function guessBlockKind(body: string, hint: BlockHint): BlockHint {
  const items = parseJsonArray(body);
  if (!items || !items.length) return hint;
  const first = items[0] as Record<string, unknown> | null;
  if (!first || typeof first !== 'object') return hint;
  if ('heading' in first || 'kind' in first) return 'proposals';
  if ('ref' in first || 'gap' in first || 'scenes' in first) return 'beats';
  return hint;
}

/**
 * Mend the JSON a model writes by hand: quotation marks inside a string
 * that were not escaped, raw line breaks and tabs inside strings, and
 * trailing commas. A quote inside a string is taken as the end of the
 * string only when what follows is punctuation that can follow a value.
 */
export function repairJson(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      out += ch + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"') {
      const rest = text.slice(i + 1).replace(/^\s*/, '');
      const closes = rest === '' || /^[,}\]:]/.test(rest);
      if (closes) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      out += ' ';
      continue;
    }
    if (ch === '\t') {
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out.replace(/,\s*([\]}])/g, '$1');
}

/** Top-level `{…}` objects of an array text, by brace depth, ignoring braces inside strings. */
function splitObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

/**
 * The JSON array in a block, read leniently: an object wrapping the array
 * ({"beats": [...]}) is unwrapped, common hand-written mistakes are mended,
 * and as a last resort the entries are read one by one so a single bad
 * entry does not lose the rest.
 */
function parseJsonArray(body: string): unknown[] | null {
  const candidates = [body];
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start >= 0 && end > start) candidates.push(body.slice(start, end + 1));
  const unwrap = (parsed: unknown): unknown[] | null => {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const inner = (parsed as Record<string, unknown>).beats ?? (parsed as Record<string, unknown>).proposals ?? (parsed as Record<string, unknown>).scenes;
      if (Array.isArray(inner)) return inner;
    }
    return null;
  };
  for (const raw of candidates) {
    for (const attempt of [raw, repairJson(raw)]) {
      try {
        const found = unwrap(JSON.parse(attempt.trim()));
        if (found) return found;
      } catch {
        // Try the next form.
      }
    }
  }
  // Entry by entry, mended, keeping the ones that read.
  const items: unknown[] = [];
  for (const piece of splitObjects(body)) {
    for (const attempt of [piece, repairJson(piece)]) {
      try {
        items.push(JSON.parse(attempt));
        break;
      } catch {
        // Next attempt, or skip this entry.
      }
    }
  }
  return items.length ? items : null;
}

function parseBeats(body: string): BeatEntry[] {
  const parsed = parseJsonArray(body);
  if (!parsed) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return parsed
    .map((b: any) => {
      const scenes = Array.isArray(b?.scenes) ? b.scenes.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0) : undefined;
      const ref = str(b?.ref) || str(b?.id) || str(b?.label);
      return { ...(ref ? { ref } : {}), title: str(b?.title), text: str(b?.text), ...(scenes?.length ? { scenes } : {}), ...(b?.gap ? { gap: true } : {}) } as BeatEntry;
    })
    .filter(b => b.title || b.text)
    .map(b => ({ ...b, title: b.title || b.text.slice(0, 60) }));
}

function parseProposals(body: string): ProposalDraft[] {
  const parsed = parseJsonArray(body);
  if (!parsed) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return parsed
    .map((p: any) => {
      const heading = str(p?.heading).toUpperCase();
      const after = sceneNumber(p?.after);
      return { kind: (p?.kind === 'scene' || heading ? 'scene' : 'beat') as 'beat' | 'scene', title: str(p?.title), text: str(p?.text), heading: heading || undefined, ...(after !== undefined ? { after } : {}) };
    })
    .filter(p => p.title || p.text)
    .map(p => ({ ...p, title: p.title || p.text.slice(0, 60) }));
}

/** A scene number as the model wrote it (12, "12", "scene 12"), or undefined. */
function sceneNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : undefined;
  if (typeof value === 'string') {
    const m = /(\d+)/.exec(value);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * An accept block, read leniently: a JSON array of labels, the word all
 * (bare, quoted or in an array), labels separated by commas or spaces, or
 * an object ({"after": 12, "scenes": [...]}) placing them all after a scene.
 * An entry may be {"label": "p1", "after": 12} to place that one.
 */
function parseAccept(body: string): AcceptBlock | null {
  const text = body.trim();
  if (!text) return null;
  if (/^"?all"?$/i.test(text)) return 'all';
  let items: unknown[] | null = null;
  let after: number | undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    let inner: unknown = parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      inner = obj.accept ?? obj.scenes ?? obj.proposals ?? obj.labels;
      after = sceneNumber(obj.after);
      if (inner === undefined && obj.label !== undefined) inner = [obj];
    }
    if (Array.isArray(inner)) items = inner;
  } catch {
    items = null;
  }
  if (!items) items = text.replace(/^\[|\]$/g, '').split(/[\s,]+/).map(x => x.replace(/^"|"$/g, ''));
  const entries: AcceptEntry[] = [];
  for (const x of items) {
    if (typeof x === 'number') entries.push({ label: `p${x}` });
    else if (typeof x === 'string' && x.trim()) entries.push({ label: x.trim() });
    else if (x && typeof x === 'object') {
      const obj = x as Record<string, unknown>;
      const label = [obj.label, obj.p, obj.id, obj.title].find(v => typeof v === 'string' || typeof v === 'number');
      if (label === undefined) continue;
      const own = sceneNumber(obj.after);
      entries.push({ label: typeof label === 'number' ? `p${label}` : String(label).trim(), ...(own !== undefined ? { after: own } : {}) });
    }
  }
  if (!entries.length) return null;
  if (entries.some(e => e.label.toLowerCase() === 'all')) return 'all';
  return after === undefined ? entries : entries.map(e => (e.after === undefined ? { ...e, after } : e));
}

/** The synopsis a proposal becomes when it turns into a scene. */
export function proposalSynopsis(p: { title: string; text: string }): string {
  if (!p.text) return p.title;
  if (!p.title || p.text.toLowerCase().startsWith(p.title.toLowerCase())) return p.text;
  return `${p.title}. ${p.text}`;
}
