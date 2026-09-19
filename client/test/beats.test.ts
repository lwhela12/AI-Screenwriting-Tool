import { describe, it, expect } from 'vitest';
import { normalizeBeats, boardExtent, CARD_WIDTH, CARD_GAP, CARD_HEIGHT, arrangeBeats, sceneSummary } from '../src/components/beats';
import { b, stateFor, viewFor } from './helpers';
import { insertScene, scenesOf, setSceneHeading, deleteScene } from '../src/components/editor-v2/scenes';

describe('beat board data', () => {
  it('migrates the old lane format into positioned cards', () => {
    const old = {
      beats: {
        'beat-1': { id: 'beat-1', title: 'Opening', description: 'Storm.', color: '#ffd966' },
        'beat-2': { id: 'beat-2', title: 'Turn', description: '', color: '#ffd966' },
        'beat-3': { id: 'beat-3', title: 'End', description: 'Dawn.', color: '#cfe2ff' }
      },
      lanes: [
        { id: 'l1', title: 'Act 1', beatIds: ['beat-1', 'beat-2'] },
        { id: 'l2', title: 'Act 3', beatIds: ['beat-3'] }
      ]
    };
    const data = normalizeBeats(old);
    expect(data.version).toBe(2);
    expect(data.beats.map(bt => bt.title)).toEqual(['Opening', 'Turn', 'End']);
    expect(data.beats[0]).toMatchObject({ text: 'Storm.', x: CARD_GAP, y: CARD_GAP });
    expect(data.beats[1].y).toBeGreaterThan(data.beats[0].y);
    expect(data.beats[2].x).toBe(CARD_GAP + CARD_WIDTH + CARD_GAP);
  });

  it('keeps the current format and tolerates garbage', () => {
    const current = { version: 2, beats: [{ id: 'a', title: 't', text: '', color: '#fff', x: 1, y: 2 }] };
    expect(normalizeBeats(current)).toEqual(current);
    expect(normalizeBeats(null)).toEqual({ version: 2, beats: [] });
    expect(normalizeBeats('nope')).toEqual({ version: 2, beats: [] });
    expect(normalizeBeats({ version: 2, beats: [{ bogus: true }] }).beats).toEqual([]);
  });

  it('reports the board extent', () => {
    expect(boardExtent({ version: 2, beats: [] })).toEqual({ width: 0, height: 0 });
    const { width, height } = boardExtent({ version: 2, beats: [{ id: 'a', title: '', text: '', color: '#fff', x: 100, y: 50 }] });
    expect(width).toBe(100 + CARD_WIDTH);
    expect(height).toBeGreaterThan(50);
  });
});

describe('sending a beat to the script', () => {
  it('creates a scene at the end with the beat text as synopsis', () => {
    const view = viewFor(stateFor(b.doc(b.sh('INT. A - DAY'), b.a('Text.'))));
    insertScene(view, null, 'ext. beach - dusk', 'They finally talk.');
    const scenes = scenesOf(view.state.doc);
    expect(scenes.map(s => s.heading)).toEqual(['INT. A - DAY', 'EXT. BEACH - DUSK']);
    expect(scenes[1].synopsis).toBe('They finally talk.');
    view.destroy();
  });

  it('renames and deletes scenes from the outline', () => {
    const view = viewFor(stateFor(b.doc(b.sh('INT. A - DAY'), b.a('One.'), b.sh('INT. B - DAY'), b.a('Two.'))));
    setSceneHeading(view, 2, 'int. b - night');
    expect(view.state.doc.child(2).textContent).toBe('INT. B - NIGHT');
    deleteScene(view, 0);
    expect(scenesOf(view.state.doc).map(s => s.heading)).toEqual(['INT. B - NIGHT']);
    deleteScene(view, 0);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild!.type.name).toBe('action');
    view.destroy();
  });
});


describe('readable board layout', () => {
  it('lays each row below the tallest measured card and preserves data', () => {
    const beats = Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: `Beat ${i}`, text: 'Keep', color: '#fff', x: i * 244, y: 24 }));
    const arranged = arrangeBeats(beats, ['0', '0', 'missing', '1', '2', '3', '4'], 2, { '0': 320, '1': 150, '2': 100, '3': 250, '4': 480 });
    expect(arranged.map(b => b.y)).toEqual([24, 24, 368, 368, 642]);
    expect(arranged[0]).toMatchObject({ title: 'Beat 0', text: 'Keep' });
    expect(boardExtent({ version: 2, beats: arranged }, { '4': 480 }).height).toBe(1122);
    expect(arrangeBeats(beats, [], 0)[1].y).toBe(24 + CARD_HEIGHT + CARD_GAP);
  });

  it('labels only genuinely contiguous scene ranges', () => {
    expect(sceneSummary([3, 1, 2, 2])).toBe('Scenes 1–3 · 3 scenes');
    expect(sceneSummary([1, 3, 90])).toBe('3 linked scenes');
    expect(sceneSummary([8])).toBe('Scene 8');
  });
});
