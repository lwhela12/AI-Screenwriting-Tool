import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The beat board in its own window.
 *
 * The board stays part of this page's React tree, drawn into a second
 * window's document through a portal: one board, one script, one save. The
 * window is opened by `openBoardWindow` (from a click, so WebKit allows it)
 * and handed to `BoardWindow`, which copies the page's styles and theme in.
 */

const WINDOW_NAME = 'pica-board';

/** Open (or bring forward) the board window. Null when the browser refuses a popup. */
export function openBoardWindow(opener: Window = window): Window | null {
  const width = Math.min(1100, Math.max(640, Math.round(opener.innerWidth * 0.6)));
  const height = Math.min(900, Math.max(480, Math.round(opener.innerHeight * 0.8)));
  const win = opener.open('', WINDOW_NAME, `popup,width=${width},height=${height}`);
  if (!win) return null;
  prepareDocument(win, opener.document);
  return win;
}

/** Give the new window this page's stylesheets and a root to render into. */
function prepareDocument(win: Window, source: Document) {
  const doc = win.document;
  if (doc.getElementById('board-root')) return;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="board-root" class="board-window"></div></body></html>');
  doc.close();
  copyStyles(source, doc);
}

function copyStyles(source: Document, target: Document) {
  target.head.querySelectorAll('[data-copied-style]').forEach(n => n.remove());
  source.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    let copy: HTMLElement;
    if (node instanceof HTMLLinkElement) {
      // An absolute address: the popup's own base is about:blank.
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = node.href;
      copy = link;
    } else {
      copy = target.createElement('style');
      copy.textContent = node.textContent;
    }
    copy.dataset.copiedStyle = '';
    target.head.appendChild(copy);
  });
}

interface BoardWindowProps {
  win: Window;
  title: string;
  theme: string;
  /** The window went away (the writer closed it, or the page could not keep it). */
  onClosed: () => void;
  children: React.ReactNode;
}

export const BoardWindow: React.FC<BoardWindowProps> = ({ win, title, theme, onClosed, children }) => {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setRoot(win.document.getElementById('board-root'));
    // Styles added after opening (a lazily loaded chunk, a dev reload) follow along.
    const observer = new MutationObserver(() => copyStyles(document, win.document));
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      onClosed();
    };
    win.addEventListener('pagehide', finish);
    // Browsers do not always tell the opener; the native app calls `boardClosed`.
    const poll = window.setInterval(() => { if (win.closed) finish(); }, 500);
    const unsubscribe = onBoardClosedByHost(finish);
    return () => {
      closed = true;
      observer.disconnect();
      window.clearInterval(poll);
      unsubscribe();
      win.removeEventListener('pagehide', finish);
      if (!win.closed) win.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);

  useEffect(() => {
    win.document.title = title ? `${title} — Beat Board` : 'Beat Board';
  }, [win, title]);

  useEffect(() => {
    win.document.documentElement.dataset.theme = theme;
  }, [win, theme]);

  return root ? createPortal(children, root) : null;
};

/** Drawn where the board would be while it is in its own window. */
export const BoardAway: React.FC<{ onShow: () => void; onDock: () => void }> = ({ onShow, onDock }) => (
  <div className="beat-board-away">
    <span>The beat board is open in its own window.</span>
    <div className="beat-board-away-actions">
      <button className="ui-chip" onClick={onShow}>Show board window</button>
      <button className="ui-chip" onClick={onDock}>Bring it back here</button>
    </div>
  </div>
);

// The native host closes the window itself; it reports that here.
const hostCloseListeners = new Set<() => void>();

function onBoardClosedByHost(listener: () => void): () => void {
  hostCloseListeners.add(listener);
  return () => hostCloseListeners.delete(listener);
}

export function notifyBoardClosed(): void {
  hostCloseListeners.forEach(l => l());
}
