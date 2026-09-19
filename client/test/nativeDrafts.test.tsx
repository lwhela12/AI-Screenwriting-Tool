import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { documentFromText, serializeDocument, setCapabilities } from '../src/host';
import { b } from './helpers';

vi.mock('../src/host', async original => ({ ...await original<typeof import('../src/host')>(), isHosted: () => true }));

// Keep the editor real; only stand in for asynchronous model replies.
const pending = vi.hoisted(() => ({ room: undefined as undefined | (() => void) }));
vi.mock('../src/components/RoomView', () => ({ RoomView: ({ onChange }: { onChange: (data: unknown) => void }) => {
  pending.room = () => onChange({ version: 2, conversations: [{ id: 'late', messages: [{ text: 'Late reply' }] }] });
  return React.createElement('div', null, 'Room test');
} }));

let mount: HTMLDivElement;
let root: Root;
const postMessage = vi.fn();
const content = JSON.stringify(b.doc(b.sh('INT. STATION - DAY'), b.a('The original ending.')).toJSON());
const initial = { title: 'Crossing', author: '', contact: '', content, beats: { version: 2, beats: [] }, room: null };

async function click(text: string) {
  const button = [...mount.querySelectorAll('button')].find(b => b.textContent === text)!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function select(id: string) {
  await act(async () => {
    const field = mount.querySelector<HTMLSelectElement>('#active-draft')!;
    field.value = id;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function input(selector: string, text: string) {
  await act(async () => {
    const field = mount.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function snapshot() { return window.__screenplay!.document()!; }
function lastSaved(): string {
  const messages = postMessage.mock.calls.map(([m]) => m).filter(m => m.type === 'changed');
  return messages[messages.length - 1].text;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  window.webkit = { messageHandlers: { host: { postMessage } } };
  setCapabilities({ ai: { available: false }, cloud: { available: false } });
  mount = document.createElement('div');
  document.body.appendChild(mount);
  root = createRoot(mount);
  await act(async () => root.render(<App />));
  await act(async () => window.__screenplay!.load(serializeDocument(initial), 'screenplay'));
  postMessage.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
  delete window.webkit;
  delete window.__screenplay;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  pending.room = undefined;
});

describe('drafts in the native app', () => {
  it('copies fresh synopsis edits, isolates subsequent changes, and reopens every draft', async () => {
    const firstID = snapshot().drafts!.activeId;
    await input('.inspector textarea', 'Original scene plan');
    await click('Create New Draft');
    const secondID = snapshot().drafts!.activeId;
    expect(secondID).not.toBe(firstID);
    expect((mount.querySelector('.inspector textarea') as HTMLTextAreaElement).value).toBe('Original scene plan');
    await input('.inspector textarea', 'A different scene plan');
    await select(firstID);
    expect((mount.querySelector('.inspector textarea') as HTMLTextAreaElement).value).toBe('Original scene plan');
    await select(secondID);
    const saved = lastSaved();
    expect(JSON.parse(saved).version).toBe(2);
    await act(async () => window.__screenplay!.load(saved, 'screenplay'));
    expect(snapshot().drafts!.activeId).toBe(secondID);
    expect((mount.querySelector('.inspector textarea') as HTMLTextAreaElement).value).toBe('A different scene plan');
    await select(firstID);
    expect((mount.querySelector('.inspector textarea') as HTMLTextAreaElement).value).toBe('Original scene plan');
    // Undo must never undo work from another draft.
    await act(async () => { (document.activeElement as HTMLElement)?.blur(); window.__screenplay!.undo(); });
    expect(snapshot().content).toContain('Original scene plan');
  });

  it('renames without resetting the editor and exports the selected content from the native menu', async () => {
    await click('Create New Draft');
    const editor = mount.querySelector('.ProseMirror');
    await click('Rename');
    await input('[aria-label="Draft name"]', 'Alternate ending');
    await click('Save name');
    expect(mount.querySelector('.ProseMirror')).toBe(editor);
    expect(mount.querySelector<HTMLSelectElement>('#active-draft')!.selectedOptions[0].text).toBe('Alternate ending');
    await input('.inspector textarea', 'Only in the alternate draft');
    postMessage.mockClear();
    await act(async () => { window.__screenplay!.exportAs('fdx'); });
    const exported = postMessage.mock.calls.map(([m]) => m).find(m => m.type === 'export');
    expect(exported.filename).toBe('crossing_alternate_ending.fdx');
    expect(atob(exported.base64)).toContain('Only in the alternate draft');
    expect(atob(exported.base64)).not.toContain('"drafts"');
  });

  it('discards a late Writers Room callback after switching drafts, including switching back', async () => {
    const firstID = snapshot().drafts!.activeId;
    await click('Room');
    const lateReply = pending.room!;
    await click('Create New Draft');
    await select(firstID);
    await act(async () => lateReply());
    expect(snapshot().room).toBeNull();
    expect(snapshot().drafts!.items.every(d => d.room === null)).toBe(true);
  });

  it('does not switch if handing the current workspace to the native host fails', async () => {
    const firstID = snapshot().drafts!.activeId;
    postMessage.mockImplementationOnce(() => { throw new Error('Host unavailable'); });
    await click('Create New Draft');
    expect(snapshot().drafts!.activeId).toBe(firstID);
    expect(snapshot().drafts!.items).toHaveLength(1);
    expect(mount.textContent).toContain('Save failed: Host unavailable');
  });

  it('keeps draft data in the immediate native save snapshot', async () => {
    await click('Create New Draft');
    await input('.inspector textarea', 'Saved immediately');
    const reopened = documentFromText(lastSaved(), 'screenplay');
    expect(reopened.drafts!.items).toHaveLength(2);
    expect(reopened.content).toContain('Saved immediately');
  });
});
