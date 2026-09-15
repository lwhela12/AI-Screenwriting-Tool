import { describe, it, expect } from 'vitest';
import { b, outline } from './helpers';
import { documentFromText, serializeDocument, contentToDoc } from '../src/host';
import { docToContent } from '../src/components/editor-v2/docConverter';

describe('host document format', () => {
  it('round-trips title page, script and beats through the app file format', () => {
    const doc = b.doc(b.sh('INT. A - DAY'), b.ch('BOB'), b.d('Hi.'));
    const beats = { version: 2, beats: [{ id: 'x', title: 'Turn', text: 'The reveal.', color: '#fde68a', x: 10, y: 20 }] };
    const text = serializeDocument({ title: 'Rain', author: 'Jane', contact: 'jane@example.com', content: docToContent(doc), beats });
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('screenplay');
    expect(parsed.version).toBe(1);
    const back = documentFromText(text, 'screenplay');
    expect(back.title).toBe('Rain');
    expect(back.author).toBe('Jane');
    expect(back.contact).toBe('jane@example.com');
    expect(back.beats).toEqual(beats);
    expect(outline(contentToDoc(back.content))).toEqual(outline(doc));
  });

  it('reads Final Draft, Fountain and plain text through the same door', () => {
    const fdx = '<FinalDraft DocumentType="Script"><Content><Paragraph Type="Scene Heading"><Text>INT. A - DAY</Text></Paragraph></Content></FinalDraft>';
    expect(outline(contentToDoc(documentFromText(fdx, 'fdx').content))).toEqual(['scene_heading: INT. A - DAY']);
    expect(outline(contentToDoc(documentFromText('Title: Rain\n\nINT. B - DAY\n\nRain.', 'fountain').content))).toEqual(['scene_heading: INT. B - DAY', 'action: Rain.']);
    expect(documentFromText('Title: Rain\n\nINT. B - DAY', 'fountain').title).toBe('Rain');
    expect(outline(contentToDoc(documentFromText('INT. C - DAY\n\nText.', 'txt', { title: 'From file' }).content))).toEqual(['scene_heading: INT. C - DAY', 'action: Text.']);
    expect(documentFromText('INT. C - DAY', 'txt', { title: 'From file' }).title).toBe('From file');
  });

  it('never throws on an empty or unreadable file', () => {
    expect(outline(contentToDoc(documentFromText('', 'screenplay').content))).toEqual(['action: ']);
    expect(outline(contentToDoc(documentFromText('{not json', 'screenplay').content))).toEqual(['action: {not json']);
  });
});
