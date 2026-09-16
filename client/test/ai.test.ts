import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { b } from './helpers';
import { scenesOf } from '../src/components/editor-v2/scenes';
import { sceneText, cleanSynopsis, capSentences, draftSynopsis, SCENE_TEXT_LIMIT } from '../src/ai';
import { requestAI, resolveAI, setCapabilities, aiAvailability } from '../src/host';

describe('scene text for prompts', () => {
  it('reads a scene as heading, action and NAME: lines', () => {
    const doc = b.doc(b.sh('INT. KITCHEN - DAY'), b.a('Mae pours coffee.'), b.ch("MAE (CONT'D)"), b.p('(quietly)'), b.d('Not today.'), b.sh('EXT. YARD - DAY'), b.a('Later.'));
    const [kitchen] = scenesOf(doc);
    expect(sceneText(doc, kitchen)).toBe('INT. KITCHEN - DAY\nMae pours coffee.\nMAE (quietly)\nMAE: Not today.');
  });

  it('keeps the opening and the ending of a very long scene', () => {
    const doc = b.doc(b.sh('INT. A - DAY'), b.a('start ' + 'x'.repeat(SCENE_TEXT_LIMIT)), b.a('the end'));
    const text = sceneText(doc, scenesOf(doc)[0]);
    expect(text.length).toBeLessThanOrEqual(SCENE_TEXT_LIMIT + 10);
    expect(text.startsWith('INT. A - DAY\nstart')).toBe(true);
    expect(text.endsWith('the end')).toBe(true);
    expect(text).toContain('[…]');
  });

  it('caps an answer that runs on', () => {
    expect(capSentences('One. Two! Three? Four. Five.', 3)).toBe('One. Two! Three?');
    expect(capSentences('Mr. Smith leaves. She stays.', 3)).toBe('Mr. Smith leaves. She stays.');
    expect(capSentences('No punctuation at all', 3)).toBe('No punctuation at all');
  });

  it('tidies a model answer into one line', () => {
    expect(cleanSynopsis('Synopsis: "Mae pours coffee\nand refuses."  ')).toBe('Mae pours coffee and refuses.');
  });
});

describe('AI bridge', () => {
  const posted: any[] = [];
  beforeEach(() => {
    posted.length = 0;
    (window as any).webkit = { messageHandlers: { host: { postMessage: (m: any) => posted.push(m) } } };
  });
  afterEach(() => {
    delete (window as any).webkit;
    setCapabilities({});
  });

  it('reports availability from the host', () => {
    expect(aiAvailability().available).toBe(false);
    setCapabilities({ ai: { available: true } });
    expect(aiAvailability().available).toBe(true);
    setCapabilities({ ai: { available: false, reason: 'Turn on Apple Intelligence.' } });
    expect(aiAvailability().reason).toBe('Turn on Apple Intelligence.');
  });

  it('sends a request and resolves it with the host answer', async () => {
    const answer = requestAI('Be brief.', 'Hello');
    expect(posted[0]).toMatchObject({ type: 'ai', instructions: 'Be brief.', prompt: 'Hello' });
    resolveAI(posted[0].id, { ok: true, text: 'Hi.' });
    await expect(answer).resolves.toBe('Hi.');
  });

  it('rejects when the host reports an error', async () => {
    const answer = requestAI('x', 'y');
    resolveAI(posted[0].id, { ok: false, error: 'The model declined.' });
    await expect(answer).rejects.toThrow('The model declined.');
  });

  it('drafts a synopsis from the scene text', async () => {
    const doc = b.doc(b.sh('INT. KITCHEN - DAY'), b.a('Mae pours coffee.'));
    const draft = draftSynopsis(doc, scenesOf(doc)[0]);
    expect(posted[0].prompt).toContain('Mae pours coffee.');
    resolveAI(posted[0].id, { ok: true, text: ' "Mae pours coffee alone." ' });
    await expect(draft).resolves.toBe('Mae pours coffee alone.');
  });

  it('refuses outside the app', async () => {
    delete (window as any).webkit;
    await expect(requestAI('x', 'y')).rejects.toThrow('Mac app');
  });
});
