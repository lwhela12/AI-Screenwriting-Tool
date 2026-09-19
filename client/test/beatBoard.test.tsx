import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeatBoard } from '../src/components/BeatBoard';
import { BeatBoardData } from '../src/components/beats';
import { b, stateFor } from './helpers';

let mount: HTMLDivElement;
let root: Root;
const changes = vi.fn();
const jump = vi.fn();
const fixture: BeatBoardData = { version: 2, beats: [
  { id: 'one', title: 'Discovery', text: 'A clue changes the plan.', color: '#fff', x: 24, y: 24, scenes: [1, 2, 3] },
  { id: 'two', title: 'Departure', text: 'They leave.', color: '#fff', x: 24, y: 50 }
] };
const state = stateFor(b.doc(b.sh('INT. A - DAY'), b.a('A.'), b.sh('EXT. B - DAY'), b.a('B.'), b.sh('INT. C - DAY')));

async function pointer(element: Element, type: string, x: number, y: number) {
  await act(async () => element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })));
}

beforeEach(async () => {
  changes.mockClear(); jump.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  mount = document.createElement('div');
  document.body.appendChild(mount);
  root = createRoot(mount);
  await act(async () => root.render(<BeatBoard data={fixture} onChange={changes} view={null} state={state} onOpenScene={jump} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('beat board interactions', () => {
  it('previews a handle drag and commits only on release', async () => {
    const handle = mount.querySelector('.beat-drag-handle')!;
    await pointer(handle, 'pointerdown', 30, 30);
    await pointer(handle, 'pointermove', 140, 100);
    expect(changes).not.toHaveBeenCalled();
    expect((mount.querySelector('.beat-card') as HTMLElement).style.left).toBe('134px');
    await pointer(handle, 'pointerup', 140, 100);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes.mock.calls[0][0].beats[0]).toMatchObject({ x: 134, y: 94, title: 'Discovery' });
  });

  it('cancels a drag without saving and leaves text controls available', async () => {
    const handle = mount.querySelector('.beat-drag-handle')!;
    await pointer(handle, 'pointerdown', 30, 30);
    await pointer(handle, 'pointermove', 200, 200);
    await pointer(handle, 'pointercancel', 200, 200);
    expect(changes).not.toHaveBeenCalled();
    expect((mount.querySelector('.beat-card') as HTMLElement).style.left).toBe('24px');
    const input = mount.querySelector('input')!;
    await pointer(input, 'pointerdown', 30, 60);
    await pointer(input, 'pointermove', 100, 80);
    await pointer(input, 'pointerup', 100, 80);
    expect(changes).not.toHaveBeenCalled();
  });

  it('supports keyboard movement and clamps at the canvas edge', async () => {
    const handle = mount.querySelector('.beat-drag-handle')!;
    await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true, cancelable: true })));
    expect(changes.mock.calls[0][0].beats[0].x).toBe(0);
    await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    expect(changes.mock.calls[1][0].beats[0].y).toBe(34);
  });

  it('collapses scene links and retains scene navigation after expansion', async () => {
    expect(mount.querySelectorAll('.beat-scene-chip')).toHaveLength(0);
    const toggle = mount.querySelector<HTMLButtonElement>('.beat-scenes-toggle')!;
    expect(toggle.textContent).toContain('Scenes 1–3 · 3 scenes');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(mount.querySelectorAll('.beat-scene-chip')).toHaveLength(3);
    await act(async () => mount.querySelectorAll<HTMLButtonElement>('.beat-scene-chip')[1].click());
    expect(jump.mock.calls[0][0].heading).toBe('EXT. B - DAY');
    expect(changes).not.toHaveBeenCalled();
  });

  it('tidies using measured expanded heights without changing card text', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains('beat-card') ? 360 : 0, width: 220, top: 0, left: 0, bottom: 360, right: 220, x: 0, y: 0, toJSON() {} };
    });
    Object.defineProperty(mount.querySelector('.beat-board-scroll'), 'clientWidth', { value: 280, configurable: true });
    await act(async () => mount.querySelector<HTMLButtonElement>('.beat-scenes-toggle')!.click());
    const tidy = [...mount.querySelectorAll('button')].find(el => el.textContent === 'Tidy board')!;
    await act(async () => tidy.click());
    expect(changes.mock.calls[0][0].beats[1]).toMatchObject({ y: 408, text: 'They leave.' });
  });
});
