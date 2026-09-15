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
}

export interface BeatBoardData {
  version: 2;
  beats: Beat[];
}

export const BEAT_COLORS = ['#fef3c7', '#fde68a', '#fecaca', '#fbcfe8', '#ddd6fe', '#bfdbfe', '#a7f3d0', '#e5e7eb'];

export const CARD_WIDTH = 220;
export const CARD_GAP = 24;

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
    return { version: 2, beats: data.beats.filter((b: any) => b && typeof b.id === 'string') };
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
export function boardExtent(data: BeatBoardData): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const b of data.beats) {
    width = Math.max(width, b.x + CARD_WIDTH);
    height = Math.max(height, b.y + 160);
  }
  return { width, height };
}
