import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardWindow, notifyBoardClosed, openBoardWindow } from '../src/components/BoardWindow';
import { BeatBoard } from '../src/components/BeatBoard';
import { BeatBoardData } from '../src/components/beats';
import { b, stateFor } from './helpers';

// An iframe stands in for the popup: a second document the page can draw into.
let frame: HTMLIFrameElement;
let popup: Window;
let mount: HTMLDivElement;
let root: Root;
const state = stateFor(b.doc(b.sh('INT. A - DAY'), b.a('A.')));
const fixture: BeatBoardData = { version: 2, beats: [{ id: 'one', title: 'Discovery', text: 'A clue.', color: '#fff', x: 24, y: 24 }] };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frame = document.createElement('iframe');
  document.body.appendChild(frame);
  popup = frame.contentWindow!;
  (popup as any).ResizeObserver = class { observe() {} disconnect() {} };
  const style = document.createElement('style');
  style.textContent = '.beat-board { color: red; }';
  style.id = 'page-style';
  document.head.appendChild(style);
  mount = document.createElement('div');
  document.body.appendChild(mount);
  root = createRoot(mount);
});

afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
  frame.remove();
  document.getElementById('page-style')?.remove();
  vi.unstubAllGlobals();
});

function open(): Window {
  const opener = { innerWidth: 1400, innerHeight: 900, document, open: vi.fn(() => popup) } as unknown as Window;
  const win = openBoardWindow(opener)!;
  expect(opener.open).toHaveBeenCalledWith('', 'pica-board', expect.stringContaining('width=840'));
  return win;
}

describe('the beat board in its own window', () => {
  it('draws the board into the other document with the page styles and theme', async () => {
    const win = open();
    const onClosed = vi.fn();
    await act(async () => root.render(
      <BoardWindow win={win} title="Rain" theme="midnight" onClosed={onClosed}>
        <BeatBoard data={fixture} onChange={() => {}} view={null} state={state} onOpenScene={() => {}} onDock={() => {}} />
      </BoardWindow>
    ));
    expect(win.document.querySelectorAll('.beat-card')).toHaveLength(1);
    expect(mount.querySelector('.beat-card')).toBeNull();
    expect(win.document.head.textContent).toContain('.beat-board { color: red; }');
    expect(win.document.documentElement.dataset.theme).toBe('midnight');
    expect(win.document.title).toBe('Rain — Beat Board');
  });

  it('handles edits and clicks made in the other window', async () => {
    const win = open();
    const changes = vi.fn();
    const dock = vi.fn();
    await act(async () => root.render(
      <BoardWindow win={win} title="" theme="paper" onClosed={() => {}}>
        <BeatBoard data={fixture} onChange={changes} view={null} state={state} onOpenScene={() => {}} onDock={dock} />
      </BoardWindow>
    ));
    const input = win.document.querySelector<HTMLInputElement>('.beat-card-title')!;
    const setValue = Object.getOwnPropertyDescriptor((win as any).HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(input, 'Reversal');
      input.dispatchEvent(new (win as any).Event('input', { bubbles: true }));
    });
    expect(changes).toHaveBeenLastCalledWith({ version: 2, beats: [expect.objectContaining({ id: 'one', title: 'Reversal' })] });
    const back = [...win.document.querySelectorAll('button')].find(button => button.textContent === 'Back to main window')!;
    await act(async () => back.click());
    expect(dock).toHaveBeenCalledOnce();
  });

  it('reports when the host closes the window', async () => {
    const win = open();
    const onClosed = vi.fn();
    await act(async () => root.render(<BoardWindow win={win} title="" theme="paper" onClosed={onClosed}><div /></BoardWindow>));
    notifyBoardClosed();
    notifyBoardClosed();
    expect(onClosed).toHaveBeenCalledOnce();
  });
});
