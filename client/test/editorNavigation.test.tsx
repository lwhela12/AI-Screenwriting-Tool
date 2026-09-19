import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { EditorView } from 'prosemirror-view';
import { undo } from 'prosemirror-history';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProseMirrorEditor } from '../src/components/editor-v2/ProseMirrorEditor';
import * as scenes from '../src/components/editor-v2/scenes';
import * as reports from '../src/components/editor-v2/reports';
import { setCapabilities } from '../src/host';
import { b } from './helpers';

const script = b.doc(
  b.sh('INT. KITCHEN - DAY'), b.a('Alex enters.'), b.ch('ALEX'), b.d('We should go.'),
  b.sh('EXT. STATION - NIGHT'), b.a('Sam waits.'), b.ch('SAM'), b.d('The train is late.')
);

let mount: HTMLDivElement;
let root: Root;
let view: EditorView;
const onContentChange = vi.fn();
const summaries = vi.spyOn(scenes, 'scenesOf');
const wordCounts = vi.spyOn(reports, 'countWords');

/** Mount the real editor and side panels with the same capability setup as the Mac host. */
async function renderScript(content = JSON.stringify(script.toJSON()), key = 'script') {
  await act(async () => root.render(
    <ProseMirrorEditor key={key} initialContent={content} onReady={ready => { view = ready; }} onContentChange={onContentChange} />
  ));
}

function wordCount(): number {
  return Number(mount.querySelector('.status-right')!.textContent!.replace(/[^\d]/g, ''));
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.webkit = { messageHandlers: { host: { postMessage: vi.fn() } } };
  setCapabilities({ ai: { available: false }, cloud: { available: false } });
  mount = document.createElement('div');
  document.body.appendChild(mount);
  root = createRoot(mount);
  await renderScript();
  // jsdom has no text geometry; native WebKit checks cover scrolling and wrapping.
  view.setProps({ handleScrollToSelection: () => true });
  summaries.mockClear();
  wordCounts.mockClear();
  onContentChange.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
  delete window.webkit;
  vi.unstubAllGlobals();
});

describe('editor navigation performance', () => {
  it('updates scene selection and details without rescanning an unchanged script or scheduling a save', async () => {
    const wordsBefore = wordCount();
    for (const ordinal of [1, 0, 1]) {
      await act(async () => mount.querySelectorAll<HTMLElement>('.scene-row')[ordinal].click());
    }
    await act(async () => view.dispatch(view.state.tr.setMeta('navigation-test', true)));

    expect(mount.querySelector('.scene-row.current .scene-heading-text')!.textContent).toBe('EXT. STATION - NIGHT');
    expect(mount.querySelector('.inspector-heading')!.textContent).toBe('EXT. STATION - NIGHT');
    expect(mount.querySelector('.inspector-chips')!.textContent).toBe('SAM');
    expect(wordCount()).toBe(wordsBefore);
    expect(summaries).not.toHaveBeenCalled();
    expect(wordCounts).not.toHaveBeenCalled();
    expect(onContentChange).not.toHaveBeenCalled();
  });

  it('refreshes the preview and word count after editing and undoing', async () => {
    const wordsBefore = wordCount();
    const actionEnd = view.state.doc.child(0).nodeSize + 1 + view.state.doc.child(1).content.size;
    await act(async () => view.dispatch(view.state.tr.insertText(' Two words', actionEnd)));

    expect(wordCount()).toBe(wordsBefore + 2);
    expect(mount.querySelector('.scene-preview')!.textContent).toBe('Alex enters. Two words');
    expect(summaries).toHaveBeenCalled();
    expect(wordCounts).toHaveBeenCalled();
    expect(onContentChange).toHaveBeenCalledTimes(1);

    await act(async () => { undo(view.state, view.dispatch); });
    expect(wordCount()).toBe(wordsBefore);
    expect(mount.querySelector('.scene-preview')!.textContent).toBe('Alex enters.');
    expect(onContentChange).toHaveBeenCalledTimes(2);
  });

  it('refreshes scene metadata and discards cached summaries when opening another document', async () => {
    await act(async () => scenes.setSceneAttrs(view, 0, { synopsis: 'A new plan.', number: '42' }));
    expect(mount.querySelector('.scene-preview')!.textContent).toBe('A new plan.');
    expect(mount.querySelector('.inspector-meta')!.textContent).toContain('Scene 42');
    expect(mount.querySelector<HTMLTextAreaElement>('.inspector textarea')!.value).toBe('A new plan.');

    const other = b.doc(b.sh('EXT. PARK - DAY'), b.a('Jamie arrives.'), b.ch('JAMIE'), b.d('Hello.'));
    await renderScript(JSON.stringify(other.toJSON()), 'other');
    expect(mount.querySelectorAll('.scene-row')).toHaveLength(1);
    expect(mount.querySelector('.scene-heading-text')!.textContent).toBe('EXT. PARK - DAY');
    expect(mount.querySelector('.inspector-chips')!.textContent).toBe('JAMIE');
    expect(mount.querySelector<HTMLTextAreaElement>('.inspector textarea')!.value).toBe('');
    expect(wordCount()).toBe(reports.countWords(other.textContent));
  });

  it('keeps scene dragging and subsequent navigation working with cached rows', async () => {
    const rows = mount.querySelectorAll<HTMLElement>('.scene-row');
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'dataTransfer', { value: { effectAllowed: '' } });
    await act(async () => { rows[0].dispatchEvent(start); });
    await act(async () => {
      rows[1].dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: 1 }));
    });
    expect(rows[1].classList.contains('drop-after')).toBe(true);
    await act(async () => { rows[1].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })); });

    expect([...mount.querySelectorAll('.scene-heading-text')].map(row => row.textContent)).toEqual(['EXT. STATION - NIGHT', 'INT. KITCHEN - DAY']);
    expect(mount.querySelector('.scene-row.dragging, .scene-row.drop-after')).toBeNull();
    expect(onContentChange).toHaveBeenCalledTimes(1);
    summaries.mockClear();
    wordCounts.mockClear();
    await act(async () => mount.querySelector<HTMLElement>('.scene-row')!.click());
    expect(mount.querySelector('.inspector-chips')!.textContent).toBe('SAM');
    expect(summaries).not.toHaveBeenCalled();
    expect(wordCounts).not.toHaveBeenCalled();
  });
});
