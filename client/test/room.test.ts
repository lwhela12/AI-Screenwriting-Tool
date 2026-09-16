import { describe, it, expect } from 'vitest';
import { b } from './helpers';
import { parseReply, roomContext, roomTurns, roomInstructions, proposalSynopsis, normalizeRoom } from '../src/components/room';
import { documentFromText, serializeDocument } from '../src/host';
import { docToContent } from '../src/components/editor-v2/docConverter';

describe('room replies', () => {
  it('separates prose from a proposals block', () => {
    const text = 'Two thoughts.\n\nSecond one.\n\n```proposals\n[{"kind":"beat","title":"The logbook","text":"Owen finds it under the charts."},{"title":"Dawn","text":"Lit.","heading":"ext. cliff path - dawn"}]\n```\n';
    const parsed = parseReply(text);
    expect(parsed.prose).toBe('Two thoughts.\n\nSecond one.');
    expect(parsed.pending).toBe(false);
    expect(parsed.proposals).toEqual([
      { kind: 'beat', title: 'The logbook', text: 'Owen finds it under the charts.', heading: undefined },
      { kind: 'scene', title: 'Dawn', text: 'Lit.', heading: 'EXT. CLIFF PATH - DAWN' }
    ]);
  });

  it('reports a block that is still streaming', () => {
    const parsed = parseReply('Thinking.\n\n```proposals\n[{"kind":"beat","ti');
    expect(parsed.prose).toBe('Thinking.');
    expect(parsed.pending).toBe(true);
    expect(parsed.proposals).toEqual([]);
  });

  it('survives a block that is not JSON', () => {
    expect(parseReply('Hi.\n```proposals\nnot json\n```').proposals).toEqual([]);
    expect(parseReply('Just prose.').prose).toBe('Just prose.');
  });

  it('turns a proposal into a synopsis without repeating itself', () => {
    expect(proposalSynopsis({ title: 'The logbook', text: 'Owen finds it.' })).toBe('The logbook. Owen finds it.');
    expect(proposalSynopsis({ title: 'Owen finds it', text: 'Owen finds it under the charts.' })).toBe('Owen finds it under the charts.');
    expect(proposalSynopsis({ title: 'Dawn', text: '' })).toBe('Dawn');
  });
});

describe('room context', () => {
  it('gives the model the outline, the board and the script', () => {
    const doc = b.doc(b.sh('INT. A - DAY'), b.a('Mae waits.'), b.ch('MAE'), b.d('Still here.'));
    const context = roomContext(doc, { version: 2, beats: [{ id: 'x', title: 'Turn', text: 'The reveal.', color: '#fff', x: 0, y: 0 }] }, 'Rain');
    expect(context).toContain('# Rain');
    expect(context).toContain('1. INT. A - DAY (MAE)');
    expect(context).toContain('- Turn: The reveal.');
    expect(context).toContain('SCENE 1 — INT. A - DAY\nMae waits.\nMAE: Still here.');
    expect(roomInstructions('ask', context)).toContain('Mode: questions');
  });

  it('sends recent turns starting with the writer', () => {
    const turns = roomTurns(
      [
        { id: '1', role: 'room', text: 'old', at: '' },
        { id: '2', role: 'writer', text: 'Where are we?', at: '' },
        { id: '3', role: 'room', text: 'Act one is done.', at: '' }
      ],
      'What next?'
    );
    expect(turns).toEqual([
      { role: 'user', text: 'Where are we?' },
      { role: 'model', text: 'Act one is done.' },
      { role: 'user', text: 'What next?' }
    ]);
  });
});

describe('room persistence', () => {
  it('lives in the script file next to the beats', () => {
    const doc = b.doc(b.sh('INT. A - DAY'));
    const room = { version: 1, messages: [{ id: 'm', role: 'writer', text: 'Hi', at: 'now' }], proposals: [] };
    const text = serializeDocument({ title: 'Rain', author: '', contact: '', content: docToContent(doc), beats: null, room });
    expect(documentFromText(text, 'screenplay').room).toEqual(room);
    expect(normalizeRoom(documentFromText(text, 'screenplay').room).messages[0].text).toBe('Hi');
    expect(normalizeRoom(null)).toEqual({ version: 1, messages: [], proposals: [] });
  });
});
