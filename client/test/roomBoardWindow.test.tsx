import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomView } from '../src/components/RoomView';
import type { RoomSession } from '../src/components/room';
import { b, stateFor } from './helpers';

let mount: HTMLDivElement;
let root: Root;
const state = stateFor(b.doc(b.sh('INT. A - DAY'), b.a('A.')));
const beats = { version: 2, beats: [{ id: 'one', title: 'Discovery', text: '', color: '#fff', x: 24, y: 24 }] };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  mount = document.createElement('div');
  document.body.appendChild(mount);
  root = createRoot(mount);
});

afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
  vi.unstubAllGlobals();
});

async function renderRoom(boardInWindow: boolean, session: RoomSession, onShowBoardWindow = vi.fn()) {
  await act(async () => root.render(
    <RoomView view={null} state={state} title="Rain" data={null} onChange={() => {}} beats={beats} onBeatsChange={() => {}} onOpenScene={() => {}}
      session={session} onSession={patch => Object.assign(session, patch)} boardInWindow={boardInWindow} onShowBoardWindow={onShowBoardWindow} />
  ));
  return onShowBoardWindow;
}

const boardButton = () => [...mount.querySelectorAll<HTMLButtonElement>('.room-pane-toggle button')].find(button => button.textContent?.startsWith('Board'))!;

describe('the Room with the board in its own window', () => {
  it('shows the board beside the chat while the board is in the main window', async () => {
    await renderRoom(false, { pane: 'board' });
    expect(mount.querySelector('.room-board .beat-card')).not.toBeNull();
    expect(mount.querySelector('.room-splitter')).not.toBeNull();
  });

  it('collapses the right-hand pane, proposals included, when the board pops out', async () => {
    const session: RoomSession = { pane: 'proposals' };
    await renderRoom(false, session);
    expect(mount.querySelector<HTMLElement>('.room-proposals')!.hidden).toBe(false);
    await renderRoom(true, session);
    expect(mount.querySelector('.room-board')).toBeNull();
    expect(mount.querySelector('.room-splitter')).toBeNull();
    expect(mount.querySelector<HTMLElement>('.room-proposals')!.hidden).toBe(true);
  });

  it('brings the board window forward from the Board button instead of opening the pane', async () => {
    const show = await renderRoom(true, { pane: 'board' });
    expect(boardButton().classList.contains('active')).toBe(false);
    await act(async () => boardButton().click());
    expect(show).toHaveBeenCalledOnce();
    expect(mount.querySelector('.room-board')).toBeNull();
  });

  it('opens the proposals on request and restores the board pane when the board comes back', async () => {
    const session: RoomSession = { pane: 'board' };
    await renderRoom(true, session);
    const proposals = [...mount.querySelectorAll('.room-pane-toggle button')].find(button => button.textContent?.startsWith('Proposals'))!;
    await act(async () => (proposals as HTMLButtonElement).click());
    expect(mount.querySelector<HTMLElement>('.room-proposals')!.hidden).toBe(false);
    await act(async () => boardButton().click());
    await renderRoom(false, session);
    expect(mount.querySelector<HTMLElement>('.room-proposals')!.hidden).toBe(false);
  });
});
