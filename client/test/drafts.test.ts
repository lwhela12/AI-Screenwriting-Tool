import { describe, expect, it } from 'vitest';
import { captureDraft, createDraft, initializeDrafts, readDrafts, renameDraft, switchDraft } from '../src/drafts';
import { documentFromText, serializeDocument, HostDocument } from '../src/host';
import { exportFilename } from '../src/utils/exporters';

const content = (text: string) => JSON.stringify({ type: 'doc', content: [{ type: 'action', content: [{ type: 'text', text }] }] });
const source: HostDocument = {
  title: 'The Crossing', author: 'A Writer', contact: 'Contact', content: content('Original ending.'),
  beats: { version: 2, beats: [{ id: 'b1', title: 'Arrival', scenes: [1] }] },
  room: { version: 2, conversations: [{ id: 'c1', messages: [{ text: 'Keep the ending.' }] }] },
  outline: { notes: ['Act one'] }
};

describe('editable workspace drafts', () => {
  it('opens an old workspace as Draft 1 without mutating its contents', () => {
    const text = serializeDocument(source);
    const doc = initializeDrafts(documentFromText(text, 'screenplay'));
    expect(JSON.parse(text).version).toBe(1);
    expect(doc.drafts.items).toHaveLength(1);
    expect(doc.drafts.items[0]).toMatchObject({ ...source, name: 'Draft 1' });
    expect(source.drafts).toBeUndefined();
  });

  it('copies the latest edits and gives all planning state independent ownership', () => {
    const first = initializeDrafts(structuredClone(source));
    const second = createDraft({ ...first, content: content('Latest ending.') });
    expect(second.drafts.items.map(d => d.name)).toEqual(['Draft 1', 'Draft 2']);
    expect(second.drafts.items[0].content).toBe(content('Latest ending.'));
    (second.beats as { beats: { title: string }[] }).beats[0].title = 'Departure';
    (second.room as { conversations: { messages: { text: string }[] }[] }).conversations[0].messages[0].text = 'Change the ending.';
    const original = switchDraft(second, first.drafts.activeId);
    expect(original.beats).toEqual(source.beats);
    expect(original.room).toEqual(source.room);
    expect(original.outline).toEqual(source.outline);
  });

  it('round-trips every draft, its own title page and scene metadata, and the selection', () => {
    const first = initializeDrafts(source);
    const second = createDraft(first);
    const changed = renameDraft({ ...second, title: 'Alternate title', author: 'Second author', contact: '', content: content('New ending.'), beats: null, room: null }, 'Alternate ending');
    const text = serializeDocument(changed);
    expect(JSON.parse(text).version).toBe(2);
    const reopened = documentFromText(text, 'screenplay');
    expect(reopened).toMatchObject({ title: 'Alternate title', author: 'Second author', content: content('New ending.'), beats: null, room: null });
    expect(reopened.drafts?.activeId).toBe(second.drafts.activeId);
    expect(switchDraft(reopened, first.drafts.activeId)).toMatchObject(source);
  });

  it('keeps editing either draft and can create a third from an earlier draft', () => {
    const first = initializeDrafts(source);
    const second = createDraft(first);
    const earlier = switchDraft({ ...second, content: content('Draft two.') }, first.drafts.activeId);
    const third = createDraft({ ...earlier, content: content('Reworked original.') });
    expect(third.content).toBe(content('Reworked original.'));
    expect(third.drafts.items.map(d => d.name)).toEqual(['Draft 1', 'Draft 2', 'Draft 3']);
    expect(switchDraft(third, second.drafts.activeId).content).toBe(content('Draft two.'));
  });

  it('validates names and generates an unused default name', () => {
    const first = renameDraft(initializeDrafts(source), 'Draft 2');
    const second = createDraft(first);
    expect(second.drafts.items[1].name).toBe('Draft 3');
    expect(() => renameDraft(second, '  ')).toThrow('Enter a draft name');
    expect(() => renameDraft(second, 'draft 2')).toThrow('already has');
    expect(() => renameDraft(second, 'x'.repeat(81))).toThrow('80');
    expect(renameDraft(second, '  New ending  ').drafts.items[1].name).toBe('New ending');
    expect(() => switchDraft(second, 'missing')).toThrow('could not be found');
  });

  it('rejects damaged or future draft archives without falling back to plain text', () => {
    const valid = initializeDrafts(source).drafts;
    for (const drafts of [null, {}, { ...valid, items: [] }, { ...valid, activeId: 'missing' }, { ...valid, items: [valid.items[0], valid.items[0]] }]) {
      expect(() => readDrafts(drafts)).toThrow();
      expect(() => documentFromText(JSON.stringify({ format: 'screenplay', version: 2, drafts }), 'screenplay')).toThrow();
    }
    expect(() => documentFromText('{"version":3}', 'screenplay')).toThrow('newer version');
  });

  it('names exports after the selected draft without changing its title page', () => {
    const doc = renameDraft(createDraft(source), 'Alternate ending');
    const project = { ...doc, id: 'test', createdAt: '', updatedAt: '' };
    for (const ext of ['pdf', 'fdx', 'fountain', 'txt']) {
      expect(exportFilename(project, ext)).toBe(`the_crossing_alternate_ending.${ext}`);
    }
    expect(doc.title).toBe('The Crossing');
    expect(captureDraft(doc).drafts.items).toHaveLength(2);
  });
});
