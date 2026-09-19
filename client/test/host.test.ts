import { describe, it, expect, vi, afterEach } from 'vitest';
import { b, outline } from './helpers';
import { documentFromText, serializeDocument, contentToDoc, installHostApi } from '../src/host';
import { docToFDX, parseFDX } from '../src/utils/fdx';
import { docToContent } from '../src/components/editor-v2/docConverter';

describe('host document format', () => {
  it('round-trips title page, script and beats through the app file format', () => {
    const doc = b.doc(b.sh('INT. A - DAY'), b.ch('BOB'), b.d('Hi.'));
    const beats = { version: 2, beats: [{ id: 'x', title: 'Turn', text: 'The reveal.', color: '#fde68a', x: 10, y: 20 }] };
    const room = { version: 1, messages: [{ role: 'user', text: 'What if the reveal happens sooner?' }] };
    const text = serializeDocument({ title: 'Rain', author: 'Jane', contact: 'jane@example.com', content: docToContent(doc), beats, room });
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('screenplay');
    expect(parsed.version).toBe(1);
    const back = documentFromText(text, 'screenplay');
    expect(back.title).toBe('Rain');
    expect(back.author).toBe('Jane');
    expect(back.contact).toBe('jane@example.com');
    expect(back.beats).toEqual(beats);
    expect(back.room).toEqual(room);
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

describe('native import handoff', () => {
  afterEach(() => { delete window.webkit; delete window.__screenplay; });

  function install() {
    const postMessage = vi.fn();
    window.webkit = { messageHandlers: { host: { postMessage } } };
    const bindings: Parameters<typeof installHostApi>[0] = {
      getView: () => null, getDocument: () => null, loadDocument: vi.fn(),
      exportAs: vi.fn(), setView: vi.fn(), setTheme: vi.fn(),
      undo: vi.fn(), redo: vi.fn(), toggleFocus: vi.fn()
    };
    installHostApi(bindings);
    postMessage.mockClear();
    return { postMessage, bindings };
  }

  it('hands the native host a savable workspace immediately after FDX import', () => {
    const { postMessage, bindings } = install();
    const fdx = docToFDX(b.doc(b.sh('INT. ROOM - DAY'), b.a('Rain falls.')), { title: 'Rain' });
    window.__screenplay!.load(fdx, 'fdx');
    expect(bindings.loadDocument).toHaveBeenCalledOnce();
    const message = postMessage.mock.calls[0][0];
    expect(message.type).toBe('changed');
    const workspace = documentFromText(message.text, 'screenplay');
    expect(workspace.title).toBe('RAIN');
    expect(outline(contentToDoc(workspace.content))).toEqual(['scene_heading: INT. ROOM - DAY', 'action: Rain falls.']);
    const exported = docToFDX(contentToDoc(workspace.content), workspace);
    expect(parseFDX(exported).doc.toJSON()).toEqual(contentToDoc(workspace.content).toJSON());
    expect(exported).not.toContain('"room"');
  });

  it('does not dirty or rewrite an existing native workspace when opening it', () => {
    const { postMessage, bindings } = install();
    const workspace = serializeDocument({ title: 'Native', author: '', contact: '', content: docToContent(b.doc(b.a('Test.'))), beats: { beats: [{ title: 'Keep this' }] }, room: { messages: [{ text: 'Keep this too' }] } });
    window.__screenplay!.load(workspace, 'screenplay');
    expect(bindings.loadDocument).toHaveBeenCalledWith(documentFromText(workspace, 'screenplay'));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('makes a new blank workspace savable without requiring an edit', () => {
    const { postMessage } = install();
    window.__screenplay!.load('', 'screenplay');
    expect(JSON.parse(postMessage.mock.calls[0][0].text).format).toBe('screenplay');
  });
});
