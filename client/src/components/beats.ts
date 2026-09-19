/**
 * Beat board model. Beats are free-floating cards on a canvas: an idea, a
 * moment, a fragment of a scene that is not yet in the script. They are
 * stored on the project as JSON and can be sent into the script as scenes.
 */

export interface Beat {
  id: string;
  title: string;
  text: string;
  color: string;
  x: number;
  y: number;
  /** Scenes (1-based, as numbered in the outline) that carry this beat. */
  scenes?: number[];
  /** A beat the story needs that the script does not have yet. */
  gap?: boolean;
}

export interface BeatBoardData {
  version: 2;
  beats: Beat[];
}

export const BEAT_COLORS = ['#fef3c7', '#fde68a', '#fecaca', '#fbcfe8', '#ddd6fe', '#bfdbfe', '#a7f3d0', '#e5e7eb'];

export const CARD_WIDTH = 220;
export const CARD_GAP = 24;
/** The height a card is laid out at when arranged in a grid. */
export const CARD_HEIGHT = 200;
/** Cards a gap is drawn in. */
export const GAP_COLOR = BEAT_COLORS[2];

export function newBeatId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `beat-${rand}`;
}

export function emptyBoard(): BeatBoardData {
  return { version: 2, beats: [] };
}

/**
 * Accept whatever is stored for a project. The original board kept beats in
 * lanes; those are laid out as columns so nothing is lost.
 */
export function normalizeBeats(raw: unknown): BeatBoardData {
  if (!raw || typeof raw !== 'object') return emptyBoard();
  const data = raw as any;
  if (data.version === 2 && Array.isArray(data.beats)) {
    return {
      version: 2,
      beats: data.beats
        .filter((b: any) => b && typeof b.id === 'string')
        .map((b: any) => {
          const scenes = Array.isArray(b.scenes) ? b.scenes.filter((n: unknown) => typeof n === 'number' && Number.isFinite(n)) : [];
          const { scenes: _s, gap: _g, ...rest } = b;
          return { ...rest, ...(scenes.length ? { scenes } : {}), ...(b.gap ? { gap: true } : {}) };
        })
    };
  }
  if (data.beats && typeof data.beats === 'object' && Array.isArray(data.lanes)) {
    const beats: Beat[] = [];
    data.lanes.forEach((lane: any, column: number) => {
      (lane.beatIds || []).forEach((id: string, row: number) => {
        const old = data.beats[id];
        if (!old) return;
        beats.push({
          id: String(id),
          title: String(old.title || ''),
          text: String(old.description || ''),
          color: typeof old.color === 'string' ? old.color : BEAT_COLORS[0],
          x: CARD_GAP + column * (CARD_WIDTH + CARD_GAP),
          y: CARD_GAP + row * 150
        });
      });
    });
    return { version: 2, beats };
  }
  return emptyBoard();
}

/** Bottom-right extent of the board, for sizing the canvas. */
export function boardExtent(data: BeatBoardData, heights: Record<string, number> = {}): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const b of data.beats) {
    width = Math.max(width, b.x + CARD_WIDTH);
    height = Math.max(height, b.y + (heights[b.id] || CARD_HEIGHT));
  }
  return { width, height };
}

/** Read nearby card tops as a row, independent of collapsed/expanded heights. */
export function readingOrder(beats: Beat[]): Beat[] {
  const remaining = [...beats].sort((a, b) => a.y - b.y || a.x - b.x);
  const ordered: Beat[] = [];
  for (let i = 0; i < remaining.length;) {
    const top = remaining[i].y;
    const row: Beat[] = [];
    while (i < remaining.length && remaining[i].y <= top + CARD_GAP) row.push(remaining[i++]);
    ordered.push(...row.sort((a, b) => a.x - b.x || a.y - b.y));
  }
  return ordered;
}

/**
 * Lay the cards named in `orderIds` out in a grid in that order; any other
 * cards follow in their present reading order.
 */
export function arrangeBeats(beats: Beat[], orderIds: string[], columns = 4, heights: Record<string, number> = {}): Beat[] {
  const byId = new Map(beats.map(b => [b.id, b]));
  const requested = new Set(orderIds.filter(id => byId.has(id)));
  const order = [...requested, ...readingOrder(beats.filter(b => !requested.has(b.id))).map(b => b.id)];
  const positions = new Map<string, { x: number; y: number }>();
  const count = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 4;
  let y = CARD_GAP;
  for (let row = 0; row < order.length; row += count) {
    const ids = order.slice(row, row + count);
    ids.forEach((id, col) => positions.set(id, { x: CARD_GAP + col * (CARD_WIDTH + CARD_GAP), y }));
    y += Math.max(...ids.map(id => heights[id] || CARD_HEIGHT)) + CARD_GAP;
  }
  return beats.map(b => ({ ...b, ...positions.get(b.id) }));
}

/** A compact label that never implies missing scene numbers are linked. */
export function sceneSummary(scenes: number[]): string {
  const numbers = [...new Set(scenes)].sort((a, b) => a - b);
  if (!numbers.length) return 'No linked scenes';
  if (numbers.length === 1) return `Scene ${numbers[0]}`;
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  return contiguous ? `Scenes ${numbers[0]}–${numbers[numbers.length - 1]} · ${numbers.length} scenes` : `${numbers.length} linked scenes`;
}
