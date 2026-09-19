import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeDocument } from '../src/host';
import App from '../src/App';

vi.mock('../src/host', async importOriginal => ({
  ...await importOriginal<typeof import('../src/host')>(),
  isHosted: () => true
}));

// Exercise App's real change/save path without the editor's layout machinery.
vi.mock('../src/components/editor-v2/ProseMirrorEditor', () => ({
  default: ({ onTitlePageChange }: { onTitlePageChange: (data: { title: string; author: string; contact: string }) => void }) =>
    React.createElement('button', { id: 'edit-title', onClick: () => onTitlePageChange({ title: 'Changed title', author: 'New author', contact: '' }) }, 'Edit')
}));

describe('native save snapshots', () => {
  afterEach(() => {
    delete window.webkit;
    delete window.__screenplay;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends edits to the native document without waiting for the browser autosave timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const postMessage = vi.fn();
    window.webkit = { messageHandlers: { host: { postMessage } } };
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);
    try {
      await act(async () => root.render(React.createElement(App)));
      const beats = { version: 2, beats: [{ id: 'one', title: 'Keep this beat' }] };
      const room = { version: 2, conversations: [{ id: 'one', messages: [{ text: 'Keep this conversation' }] }] };
      await act(async () => window.__screenplay!.load(serializeDocument({ title: 'Before', author: '', contact: '', content: '{"type":"doc","content":[{"type":"action"}]}', beats, room }), 'screenplay'));
      postMessage.mockClear();
      await act(async () => mount.querySelector<HTMLButtonElement>('#edit-title')!.click());
      const messages = postMessage.mock.calls.map(([message]) => message).filter(message => message.type === 'changed');
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0].text)).toMatchObject({ title: 'Changed title', author: 'New author', beats, room });
      postMessage.mockClear();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }));
      });
      expect(postMessage.mock.calls.map(([message]) => message.type)).toEqual(['changed', 'save']);
      expect(JSON.parse(postMessage.mock.calls[0][0].text).author).toBe('New author');
    } finally {
      await act(async () => root.unmount());
      mount.remove();
    }
  });
});
