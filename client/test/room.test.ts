import { describe, it, expect, beforeAll } from 'vitest';
import { b, stateFor, viewFor } from './helpers';
import { parseReply, roomContext, roomTurns, roomInstructions, proposalSynopsis, proposalsContext, acceptedProposals, placementPlan, placementLabel, placeScenes, normalizeRoom, wordCount, withConversation, patchConversation, activeConversation, newConversation, conversationLabel, parseSummary, summaryPrompt, boardContext, applyBeatSheet, repairJson, purposeFor } from '../src/components/room';
import { readingOrder } from '../src/components/beats';
import { scenesOf } from '../src/components/editor-v2/scenes';
import { pdfLinesToText } from '../src/utils/pdfImport';
import { docxToText } from '../src/utils/docx';
import { documentFromText, serializeDocument } from '../src/host';
import { docToContent } from '../src/components/editor-v2/docConverter';
import { layoutFromDoc } from '../src/components/editor-v2/pagination/fromDoc';

describe('room replies', () => {
  it('separates prose from a proposals block', () => {
    const text = 'Two thoughts.\n\nSecond one.\n\n```proposals\n[{"kind":"beat","title":"The logbook","text":"Owen finds it under the charts."},{"title":"Dawn","text":"Lit.","heading":"ext. cliff path - dawn"}]\n```\n';
    const parsed = parseReply(text);
    expect(parsed.prose).toBe('Two thoughts.\n\nSecond one.');
    expect(parsed.pending).toBe(false);
    expect(parsed.beats).toEqual([]);
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
    expect(context).toContain('b1. Turn — The reveal.');
    expect(context).toContain('SCENE 1 — INT. A - DAY\nMae waits.\nMAE: Still here.');
    expect(roomInstructions('analyze', context)).toContain('Mode: analyzing the script');
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
    const room = { version: 1, messages: [{ id: 'm', role: 'writer', text: 'Hi', at: '2026-09-01T00:00:00Z' }], proposals: [] };
    const text = serializeDocument({ title: 'Rain', author: '', contact: '', content: docToContent(doc), beats: null, room });
    expect(documentFromText(text, 'screenplay').room).toEqual(room);
    // A version 1 file (one conversation) becomes the first entry of the list.
    const upgraded = normalizeRoom(documentFromText(text, 'screenplay').room);
    expect(upgraded.version).toBe(2);
    expect(upgraded.conversations).toHaveLength(1);
    expect(upgraded.conversations[0].messages[0].text).toBe('Hi');
    expect(upgraded.conversations[0].createdAt).toBe('2026-09-01T00:00:00Z');
    expect(upgraded.activeId).toBe(upgraded.conversations[0].id);
    expect(normalizeRoom(null)).toEqual({ version: 2, conversations: [] });
  });
});

describe('treatment', () => {
  const doc = b.doc(b.sh('INT. A - DAY'), b.a('Mae waits.'));
  const treatment = { name: 'Rain.txt', text: 'Mae waits for Owen.\n\nHe never comes.', at: '2026-09-15T00:00:00Z' };

  it('is read to the model before the outline, and plotting asks for scenes', () => {
    const context = roomContext(doc, null, 'Rain', treatment);
    expect(context.indexOf('## Treatment (Rain.txt)')).toBeLessThan(context.indexOf('## Outline'));
    expect(context).toContain('He never comes.');
    expect(roomContext(doc, null, 'Rain', null)).not.toContain('## Treatment');
    const instructions = roomInstructions('plot', context);
    expect(instructions).toContain('Mode: plotting from the treatment');
    expect(instructions).toContain('up to fifteen scenes');
    expect(instructions).toContain('50 to 90 scenes');
  });

  it('is kept in the script file and dropped when empty', () => {
    const room = { version: 1, messages: [], proposals: [], treatment };
    const text = serializeDocument({ title: 'Rain', author: '', contact: '', content: docToContent(doc), beats: null, room });
    expect(normalizeRoom(documentFromText(text, 'screenplay').room).treatment).toEqual(treatment);
    expect(normalizeRoom({ version: 1, messages: [], proposals: [], treatment: { name: 'x', text: '   ' } }).treatment).toBeUndefined();
    expect(normalizeRoom({ version: 1, messages: [], proposals: [], treatment: { text: 'Just text.' } }).treatment).toEqual({ name: 'Treatment', text: 'Just text.', at: '' });
    expect(wordCount(treatment.text)).toBe(7);
  });

  it('reads a PDF as paragraphs', () => {
    const lines = [
      { page: 1, x: 72, y: 100, width: 300, text: 'Mae waits for Owen' },
      { page: 1, x: 72, y: 114, width: 200, text: 'on the quay.' },
      { page: 1, x: 72, y: 150, width: 200, text: 'He never comes.' },
      { page: 2, x: 72, y: 72, width: 200, text: 'Morning.' }
    ];
    expect(pdfLinesToText(lines)).toBe('Mae waits for Owen on the quay.\n\nHe never comes.\n\nMorning.');
  });
});

describe('treatment from Word', () => {
  // A three-paragraph .docx (title, a paragraph with an italic run, a paragraph), zipped.
  const DOCX_BASE64 = 'UEsDBBQAAAAIAC+jL13JTxqw6wAAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QvU7DMBDeeQrLK4odGBBCSTrwMwJDeYCTfUks7LPlc0v79jht6YAK4933q69b7YIXW8zsIvXyRrVSIJloHU29/Fi/NPdScAGy4CNhL/fIcjVcdet9QhZVTNzLuZT0oDWbGQOwigmpImPMAUo986QTmE+YUN+27Z02kQpSacriIYfuCUfY+CKed/V9LJLRsxSPR+KS1UtIyTsDpeJ6S/ZXSnNKUFV54PDsEl9XgtQXExbk74CT7q0uk51F8Q65vEKoLP0Vs9U2mk2oSvW/zYWecRydwbN+cUs5GmSukwevzkgARz/99WHu4RtQSwMEFAAAAAgAL6MvXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBBQAAAAIAC+jL11K8/Cc+AAAAKoBAAARAAAAd29yZC9kb2N1bWVudC54bWyFkE1OxDAMhfecwsqeprBAqGozO8QGgWA4QEjNNFL+iD0tvT1pOwNCQmLj5MX25xe3u0/vYMRMNoZOXFW1AAwm9jYcOvG6v7u8FUCsQ69dDNiJGUns1EU7NX00R4+BoRACNVMnBubUSElmQK+piglDyb3H7DUXmQ9yirlPORokKgO8k9d1fSO9tkGognyL/byy06LSU16PF54dwtSM2nVib9mhkKqV3wVrYPVcKMsrr7m8VfzQtqrFbENJm/KVlJEwjyjUgy58bZmgmIXHCQP8Ip3DNs9u00+KVQzAA8LHUc/VvwbUPULAsnAw0SP92SBPm1gu5y2rL1BLAQIUAxQAAAAIAC+jL13JTxqw6wAAAK4BAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAL6MvXbmBRHGwAAAAKgEAAAsAAAAAAAAAAAAAAIABHAEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAL6MvXUrz8Jz4AAAAqgEAABEAAAAAAAAAAAAAAIAB9QEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAABwDAAAAAA==';

  it('reads a .docx as paragraphs of plain text', async () => {
    const bytes = Uint8Array.from(atob(DOCX_BASE64), c => c.charCodeAt(0));
    expect(await docxToText(bytes.buffer)).toBe('Rain\n\nMae waits for Owen on the quay.\n\nHe never comes.');
  });
});

describe('pages and format', () => {
  const doc = b.doc(b.sh('INT. A - DAY'), b.a('Mae waits.'), b.ch('MAE'), b.d('Still here.'));

  it('tells the model where pages fall when it has the layout', () => {
    const { layout } = layoutFromDoc(doc);
    const context = roomContext(doc, null, 'Rain', null, layout);
    expect(context).toContain('1 page as formatted');
    expect(context).toContain('1. INT. A - DAY (p. 1, 1/8 pages) (MAE)');
    expect(context).toContain('SCENE 1 — INT. A - DAY\n[p. 1]\nMae waits.\nMAE: Still here.');
    expect(roomContext(doc, null, 'Rain')).not.toContain('[p. 1]');
  });

  it('shapes the advice to the format and keeps the choice in the file', () => {
    const context = roomContext(doc, null, 'Rain');
    expect(roomInstructions('break', context)).toContain('Format: The script is a feature film.');
    expect(roomInstructions('break', context, 'tv-hour')).toContain('teaser and four or five acts');
    expect(roomInstructions('plot', context, 'tv-half')).toContain('a half-hour episode of 22 to 35 pages');
    expect(normalizeRoom({ version: 1, messages: [], proposals: [], format: 'short' }).format).toBe('short');
    expect(normalizeRoom({ version: 1, messages: [], proposals: [], format: 'radio' }).format).toBeUndefined();
  });
});

describe('conversations', () => {
  it('keeps several, drops empty ones, and remembers which is open', () => {
    const a = { ...newConversation(), id: 'a', messages: [{ id: '1', role: 'writer' as const, text: 'Where are we?', at: '2026-09-01T00:00:00Z' }] };
    const b = { ...newConversation(), id: 'b' };
    let room = withConversation({ version: 2 as const, conversations: [] }, a);
    room = withConversation(room, b);
    expect(room.activeId).toBe('b');
    expect(room.conversations.map(c => c.id)).toEqual(['b', 'a']);
    // The empty one survives while it is open, and goes once another is opened.
    const open = normalizeRoom(JSON.parse(JSON.stringify(room)));
    expect(open.conversations.map(c => c.id)).toEqual(['b', 'a']);
    expect(activeConversation(open)?.id).toBe('b');
    const stored = normalizeRoom(JSON.parse(JSON.stringify({ ...room, activeId: 'a' })));
    expect(stored.conversations.map(c => c.id)).toEqual(['a']);
    expect(activeConversation(stored)?.id).toBe('a');
    expect(conversationLabel(a)).toBe('Where are we?');
    expect(conversationLabel(patchConversation(room, 'a', { title: 'The logbook' }).conversations[1])).toBe('The logbook');
  });

  it('reads a model summary and builds its prompt from the prose only', () => {
    expect(parseSummary('Title: The logbook problem\nSummary: Owen finds it too early. Open: who hid it.')).toEqual({ title: 'The logbook problem', summary: 'Owen finds it too early. Open: who hid it' });
    expect(parseSummary('**Title:** "Mae stalls"\n**Summary:** Mae keeps Owen back.').title).toBe('Mae stalls');
    const c = { ...newConversation(), messages: [{ id: '1', role: 'writer' as const, text: 'Hi', at: '' }, { id: '2', role: 'room' as const, text: 'Thoughts.\n\n```proposals\n[{"title":"x","text":"y"}]\n```', at: '' }] };
    const prompt = summaryPrompt(c);
    expect(prompt).toContain('WRITER: Hi');
    expect(prompt).toContain('ROOM: Thoughts.');
    expect(prompt).not.toContain('proposals');
  });
});

describe('beats on the board', () => {
  const board = {
    version: 2 as const,
    beats: [
      { id: 'one', title: 'Owen arrives', text: 'Soaked.', color: '#fef3c7', x: 24, y: 24 },
      { id: 'two', title: 'Mae stalls', text: 'One more night.', color: '#fef3c7', x: 268, y: 24 }
    ]
  };

  it('lists the board for the model in reading order with labels', () => {
    const shuffled = { version: 2 as const, beats: [board.beats[1], { ...board.beats[0], scenes: [1, 2] }] };
    expect(boardContext(shuffled)).toBe('b1. Owen arrives — Soaked. (scenes 1, 2)\nb2. Mae stalls — One more night.');
  });

  it('reads a beats block from a reply, alongside prose', () => {
    const parsed = parseReply('The arc bends at the harbour.\n\n```beats\n[{"ref":"b2","title":"Mae stalls him","text":"One more night.","scenes":[4]},{"title":"The logbook","text":"Owen reads it.","gap":true}]\n```\n');
    expect(parsed.prose).toBe('The arc bends at the harbour.');
    expect(parsed.beats).toEqual([
      { ref: 'b2', title: 'Mae stalls him', text: 'One more night.', scenes: [4] },
      { title: 'The logbook', text: 'Owen reads it.', gap: true }
    ]);
    expect(parseReply('Thinking.\n\n```beats\n[{"ti').pending).toBe(true);
  });

  it('updates beats by label, adds new ones, never deletes, and arranges when the order changes', () => {
    // A rewording keeps the writer's arrangement.
    const reworded = applyBeatSheet(board, [{ ref: 'b1', title: 'Owen arrives soaked', text: 'Soaked.' }]);
    expect(reworded.changedIds).toEqual(['one']);
    expect(reworded.board.beats.find(b => b.id === 'one')).toMatchObject({ title: 'Owen arrives soaked', x: 24, y: 24 });
    expect(reworded.board.beats).toHaveLength(2);

    // A new beat between the two re-lays the cards out in the block's order; the untouched one is kept.
    const grown = applyBeatSheet(board, [{ ref: 'b1', title: 'Owen arrives', text: 'Soaked.' }, { title: 'The logbook', text: 'Owen reads it.', gap: true, scenes: [3] }]);
    expect(grown.board.beats).toHaveLength(3);
    const order = readingOrder(grown.board.beats).map(b => b.title);
    expect(order).toEqual(['Owen arrives', 'The logbook', 'Mae stalls']);
    const added = grown.board.beats.find(b => b.title === 'The logbook')!;
    expect(added).toMatchObject({ gap: true, scenes: [3], color: '#fecaca' });
    expect(grown.changedIds).toEqual([added.id]);

    // Swapping two existing beats moves them.
    const swapped = applyBeatSheet(board, [{ ref: 'b2', title: 'Mae stalls', text: 'One more night.' }, { ref: 'b1', title: 'Owen arrives', text: 'Soaked.' }]);
    expect(readingOrder(swapped.board.beats).map(b => b.id)).toEqual(['two', 'one']);
    expect(swapped.changedIds).toEqual([]);
  });

  it('talks first and only fills the board or the outline in the steps', () => {
    const context = roomContext(b.doc(b.sh('INT. A - DAY')), null, 'Rain');
    expect(roomInstructions('break', context)).toContain('no proposals or beats blocks unless the writer asks');
    expect(roomInstructions('beats', context)).toContain('Mode: laying out the beats');
    expect(roomInstructions('beats', context)).toContain('There is no target, minimum or maximum number of beats');
    expect(roomInstructions('beats', context, 'tv-half')).not.toContain('12 to 20 beats');
    expect(roomInstructions('scenes', context, 'tv-hour')).toContain('an hour drama episode of 45 to 60 pages');
  });
});

describe('lenient blocks', () => {
  it('reads a JSON-fenced block by its shape or the running step, forgives trailing commas, and keeps what it cannot read', () => {
    const beatsAsJson = 'Notes.\n\n```json\n[{"ref":"b1","title":"Owen arrives","text":"Soaked.",},]\n```';
    expect(parseReply(beatsAsJson, 'proposals').beats).toHaveLength(1);
    const wrapped = '```beats\n{"beats":[{"title":"The logbook","text":"Owen reads it."}]}\n```';
    expect(parseReply(wrapped).beats[0].title).toBe('The logbook');
    const bare = '```json\n[{"title":"X","text":"Y"}]\n```';
    expect(parseReply(bare, 'beats').beats).toHaveLength(1);
    expect(parseReply(bare, 'proposals').proposals).toHaveLength(1);
    const broken = parseReply('Tried.\n\n```beats\nnot json at all\n```');
    expect(broken.beats).toEqual([]);
    expect(broken.unreadable).toContain('not json at all');
    expect(broken.prose).toBe('Tried.');
  });
});

describe('mending hand-written JSON', () => {
  it('escapes stray quotes and line breaks inside strings, and reads entry by entry when one is broken', () => {
    const inner = '[{"ref":"b1","title":"Refusing the Fix","text":"Reginald says "no" to Wallace.\nHe gets slugged.","scenes":[16]}]';
    expect(JSON.parse(repairJson(inner))[0].text).toBe('Reginald says "no" to Wallace. He gets slugged.');
    const parsed = parseReply('```beats\n' + inner + '\n```');
    expect(parsed.beats).toHaveLength(1);
    expect(parsed.beats[0].text).toBe('Reginald says "no" to Wallace. He gets slugged.');
    const mixed = '```beats\n[{"title":"Good","text":"Fine."},{"title":"Bad" "text":"Missing colon"},{"title":"Also good","text":"Ok."}]\n```';
    expect(parseReply(mixed).beats.map(b => b.title)).toEqual(['Good', 'Also good']);
  });
});


describe('uncapped beat analysis', () => {
  it('uses the requested depth and separates analysis from invention in every format', () => {
    for (const format of ['feature', 'tv-hour', 'tv-half', 'limited', 'short'] as const) {
      const prompt = roomInstructions('beats', 'Source script', format, { depth: 'scenes', purpose: 'analyze' });
      expect(prompt).toContain('every numbered scene in order');
      expect(prompt).toContain('Do not invent missing events');
      expect(prompt).toContain('no per-reply card quota');
      expect(prompt).not.toMatch(/Up to twenty|three to five pages|at most three or four|25 to 40 beats|5 to 12 beats/);
      expect(prompt).toContain('Never claim partial coverage is complete');
    }
    expect(roomInstructions('break', '', 'feature')).toContain('no per-reply card quota');
    expect(roomInstructions('beats', '', 'feature', { depth: 'overview', purpose: 'develop' })).toContain('every invented or not-yet-written beat must have gap: true');
    expect(roomInstructions('beats', '', 'feature', { depth: 'turns' })).toContain('each meaningful change');
  });

  it('roundtrips beat preferences and discards unknown values', () => {
    expect(normalizeRoom({ version: 2, conversations: [], beatDepth: 'scenes' })).toMatchObject({ beatDepth: 'scenes' });
    expect(normalizeRoom({ version: 2, conversations: [], beatDepth: 'nope' })).not.toHaveProperty('beatDepth');
    expect(normalizeRoom({ version: 2, conversations: [], mode: 'analyze' })).toMatchObject({ mode: 'analyze' });
    expect(normalizeRoom({ version: 2, conversations: [], mode: 'beats' })).not.toHaveProperty('mode');
    expect(purposeFor('analyze')).toBe('analyze');
    expect(purposeFor('break')).toBe('develop');
    expect(purposeFor('plot')).toBe('develop');
  });

  it('parses and applies an uncapped response without dropping cards', () => {
    const entries = Array.from({ length: 120 }, (_, i) => ({ title: `Turn ${i + 1}`, text: 'A new discovery.', scenes: [i + 1] }));
    const parsed = parseReply('```beats\n' + JSON.stringify(entries) + '\n```');
    expect(parsed.beats).toHaveLength(120);
    const result = applyBeatSheet({ version: 2, beats: [] }, parsed.beats);
    expect(result.board.beats).toHaveLength(120);
    expect(readingOrder(result.board.beats).map(b => b.title)).toEqual(entries.map(e => e.title));
  });

  it('keeps reply refs attached to the requested cards after dragging or deleting during a request', () => {
    const first = { id: 'a', title: 'First', text: 'Original', color: '#fff', x: 24, y: 24 };
    const second = { ...first, id: 'b', title: 'Second', x: 268 };
    const snapshot = { version: 2 as const, beats: [first, second] };
    const moved = { version: 2 as const, beats: [{ ...first, x: 500 }, { ...second, x: 24 }] };
    const entries = [{ ref: 'b1', title: 'First updated', text: 'Updated' }];
    expect(applyBeatSheet(moved, entries, snapshot).board.beats.find(b => b.id === 'a')?.title).toBe('First updated');
    const deleted = applyBeatSheet({ version: 2, beats: [second] }, entries, snapshot);
    expect(deleted.board.beats).toEqual([second]);
  });
});

describe('accepting proposals into the outline', () => {
  const waiting = [
    { id: 'a', kind: 'scene' as const, title: 'The logbook', text: 'Owen finds it under the charts.', heading: 'INT. WHEELHOUSE - NIGHT', status: 'open' as const, messageId: 'm' },
    { id: 'b', kind: 'scene' as const, title: 'Dawn', text: 'Mae is gone.', heading: 'EXT. CLIFF PATH - DAWN', status: 'kept' as const, messageId: 'm' },
    { id: 'c', kind: 'beat' as const, title: 'The call', text: 'The call', status: 'open' as const, messageId: 'm' }
  ];

  it('reads an accept block in its several spellings', () => {
    expect(parseReply('Done.\n\n```accept\n["p1","p3"]\n```').accept).toEqual([{ label: 'p1' }, { label: 'p3' }]);
    expect(parseReply('```accept\nall\n```').accept).toBe('all');
    expect(parseReply('```accept\n["all"]\n```').accept).toBe('all');
    expect(parseReply('```accept\np1, p2\n```').accept).toEqual([{ label: 'p1' }, { label: 'p2' }]);
    expect(parseReply('```accept\n[1, 2]\n```').accept).toEqual([{ label: 'p1' }, { label: 'p2' }]);
    expect(parseReply('```accept\n{"accept":["p2"]}\n```').accept).toEqual([{ label: 'p2' }]);
    expect(parseReply('```accept\n{"after":12,"scenes":["p1",{"label":"p2","after":3}]}\n```').accept).toEqual([{ label: 'p1', after: 12 }, { label: 'p2', after: 3 }]);
    expect(parseReply('```accept\n[{"label":"p1","after":"scene 4"}]\n```').accept).toEqual([{ label: 'p1', after: 4 }]);
    const parsed = parseReply('Placing them.\n\n```accept\n["p1"]\n```\n');
    expect(parsed.prose).toBe('Placing them.');
    expect(parsed.proposals).toEqual([]);
    expect(parseReply('Nothing here.').accept).toBeUndefined();
    expect(parseReply('```accept\n\n```').accept).toBeUndefined();
  });

  it('lists only the waiting proposals for the model, labelled in pane order', () => {
    expect(proposalsContext(waiting)).toBe('p1. INT. WHEELHOUSE - NIGHT — The logbook — Owen finds it under the charts.\np2. The call');
    expect(proposalsContext([])).toBe('');
    const context = roomContext(b.doc(b.sh('INT. A - DAY')), null, 'Rain', null, undefined, waiting);
    expect(context).toContain('## Proposals waiting');
    expect(context).toContain('p1. INT. WHEELHOUSE - NIGHT');
    expect(context).not.toContain('Dawn');
    expect(roomContext(b.doc(b.sh('INT. A - DAY')), null, 'Rain')).not.toContain('## Proposals waiting');
  });

  it('resolves labels, titles and all against the waiting proposals', () => {
    const labels = (...ls: string[]) => ls.map(label => ({ label }));
    expect(acceptedProposals(waiting, 'all').map(p => p.id)).toEqual(['a', 'c']);
    expect(acceptedProposals(waiting, labels('p2', 'p1')).map(p => p.id)).toEqual(['c', 'a']);
    expect(acceptedProposals(waiting, labels('P1', '1', 'p1')).map(p => p.id)).toEqual(['a']);
    expect(acceptedProposals(waiting, labels('the call', 'ext. cliff path - dawn', 'p9')).map(p => p.id)).toEqual(['c']);
    expect(acceptedProposals(waiting, labels('Dawn'))).toEqual([]);
    // The block can say where a proposal goes, overriding what it was proposed with.
    const placed = [{ ...waiting[0], after: 2 }, waiting[2]];
    expect(acceptedProposals(placed, [{ label: 'p1' }, { label: 'p2', after: 0 }]).map(p => p.after)).toEqual([2, 0]);
    expect(acceptedProposals(placed, [{ label: 'p1', after: 7 }]).map(p => p.after)).toEqual([7]);
  });

  it('reads where a proposed scene goes', () => {
    const parsed = parseReply('```proposals\n[{"kind":"scene","title":"A","text":"a","heading":"INT. A - DAY","after":12},{"title":"B","text":"b","heading":"INT. B - DAY","after":"scene 3"},{"title":"C","text":"c","heading":"INT. C - DAY"}]\n```');
    expect(parsed.proposals.map(p => p.after)).toEqual([12, 3, undefined]);
    const shown = proposalsContext([{ ...waiting[0], after: 12 }, { ...waiting[2], after: 0 }]);
    expect(shown).toContain('(after scene 12)');
    expect(shown).toContain('(before scene 1)');
    expect(placementLabel(12, 30)).toBe('After scene 12');
    expect(placementLabel(0, 30)).toBe('Before scene 1');
    expect(placementLabel(undefined, 30)).toBe('At the end');
    expect(placementLabel(40, 30)).toBe('At the end');
  });

  it('plans insertions so each scene lands where it was asked, in a 10-scene outline', () => {
    // Two after scene 3 (in order), one before the first, one at the end, one beyond the outline.
    const plan = placementPlan([{ after: 3 }, { after: 3 }, { after: 0 }, {}, { after: 99 }], 10);
    // Later anchors first; the same anchor in reverse, so insertion order keeps the listed order.
    expect(plan.map(s => s.index)).toEqual([4, 3, 1, 0, 2]);
    expect(plan.map(s => s.after)).toEqual([10, 10, 3, 3, 0]);
    // Final numbers: the outline is now 15 scenes.
    const byIndex = new Map(plan.map(s => [s.index, s.number]));
    expect(byIndex.get(2)).toBe(1); // before the old scene 1
    expect(byIndex.get(0)).toBe(5); // old scene 3 is now 4
    expect(byIndex.get(1)).toBe(6);
    expect(byIndex.get(3)).toBe(14);
    expect(byIndex.get(4)).toBe(15);
    expect(placementPlan([], 0)).toEqual([]);
    expect(placementPlan([{ after: 2 }], 0)).toEqual([{ index: 0, after: 0, number: 1 }]);
  });

  it('tells the model that proposals wait until placed', () => {
    const instructions = roomInstructions('break', 'ctx');
    expect(instructions).toContain('```accept');
    expect(instructions).toContain('do not propose them again');
  });
});

describe('placing scenes in the script', () => {
  // jsdom has no layout: give ProseMirror empty rectangles when it scrolls the new scene into view.
  beforeAll(() => {
    const proto = Range.prototype as unknown as Record<string, unknown>;
    if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
    if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  });
  const prop = (title: string, heading: string, after?: number) => ({ id: title, kind: 'scene' as const, title, text: `${title} happens.`, heading, status: 'open' as const, messageId: 'm', ...(after !== undefined ? { after } : {}) });
  const headings = (view: ReturnType<typeof viewFor>) => scenesOf(view.state.doc).map(s => s.heading);

  it('lands each scene where it was asked, in a script with opening material', () => {
    const view = viewFor(stateFor(b.doc(b.a('FADE IN.'), b.sh('INT. ONE - DAY'), b.sh('INT. TWO - DAY'), b.sh('INT. THREE - DAY'))));
    const placed = placeScenes(view, [prop('A', 'INT. A - DAY', 2), prop('B', 'INT. B - DAY', 2), prop('C', 'INT. C - DAY', 0), prop('D', 'INT. D - DAY'), prop('E', 'INT. E - DAY', 40)]);
    expect(headings(view)).toEqual(['', 'INT. C - DAY', 'INT. ONE - DAY', 'INT. TWO - DAY', 'INT. A - DAY', 'INT. B - DAY', 'INT. THREE - DAY', 'INT. D - DAY', 'INT. E - DAY']);
    expect(placed.map(p => p.status)).toEqual(['kept', 'kept', 'kept', 'kept', 'kept']);
    // Each ordinal points at the scene it became.
    const scenes = scenesOf(view.state.doc);
    expect(placed.map(p => scenes[p.sceneOrdinal!].heading)).toEqual(['INT. A - DAY', 'INT. B - DAY', 'INT. C - DAY', 'INT. D - DAY', 'INT. E - DAY']);
    expect(scenes[4].synopsis).toBe('A happens.');
    view.destroy();
  });

  it('puts a scene before the first when nothing comes before it, and at the end of an empty script', () => {
    const view = viewFor(stateFor(b.doc(b.sh('INT. ONE - DAY'), b.sh('INT. TWO - DAY'))));
    placeScenes(view, [prop('C', 'INT. C - DAY', 0)]);
    expect(headings(view)).toEqual(['INT. C - DAY', 'INT. ONE - DAY', 'INT. TWO - DAY']);
    view.destroy();
    const empty = viewFor(stateFor(b.doc(b.a(''))));
    const placed = placeScenes(empty, [prop('A', 'INT. A - DAY', 5)]);
    expect(headings(empty)).toEqual(['', 'INT. A - DAY']);
    expect(placed[0].sceneOrdinal).toBe(1);
    empty.destroy();
  });
});
