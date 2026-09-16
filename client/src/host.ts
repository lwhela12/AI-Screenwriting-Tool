import { EditorView } from 'prosemirror-view';
import { pageViewKey } from './components/editor-v2/plugins/pageView';
import { parseFDX } from './utils/fdx';
import { parseFountain } from './utils/fountain';
import { contentToDoc, docToContent, textToDoc } from './components/editor-v2/docConverter';
import { PAGE } from './components/editor-v2/pagination/layout';
import { importPdf } from './utils/pdfImport';

/**
 * The bridge to a native host (the macOS app's WKWebView).
 *
 * When the page runs inside the app, `window.webkit.messageHandlers.host`
 * exists and the app owns the document: it hands us the file's contents,
 * we hand back every change, and it saves. The browser build never sees
 * any of this and keeps talking to the server.
 */

export interface HostDocument {
  title: string;
  author: string;
  contact: string;
  /** Editor document JSON (see docConverter). */
  content: string;
  beats: unknown;
}

type HostMessage =
  | { type: 'ready' }
  | { type: 'changed'; text: string }
  | { type: 'save' }
  | { type: 'log'; message: string }
  | { type: 'wrapCheck'; result: WrapCheckResult }
  /** A file the page produced (export): the host shows a save panel and writes it. */
  | { type: 'export'; filename: string; mime: string; base64: string };

export interface WrapCheckResult {
  elements: number;
  mismatches: { index: number; type: string; engine: number; rendered: number; text: string }[];
  lineHeightPx: number;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { host?: { postMessage: (m: unknown) => void } } };
    __screenplay?: ScreenplayHostApi;
  }
}

export function isHosted(): boolean {
  return typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.host;
}

export function postToHost(message: HostMessage): void {
  window.webkit?.messageHandlers?.host?.postMessage(message);
}

/** Functions the native side calls through evaluateJavaScript. */
export type HostFormat = 'screenplay' | 'fdx' | 'fountain' | 'txt' | 'pdf';

export interface ScreenplayHostApi {
  /** Replace the open document. `format` tells us how to read `text` (base64 for pdf). */
  load: (text: string, format: HostFormat, meta?: Partial<HostDocument>) => void;
  /** Produce an export; the result reaches the host as an `export` message. */
  exportAs: (format: 'pdf' | 'fdx' | 'fountain' | 'txt') => void;
  /** The current document, serialized. */
  document: () => HostDocument | null;
  /** Compare the browser's line wrapping with the pagination engine's, element by element. */
  wrapCheck: () => WrapCheckResult | null;
  setTheme: (name: string) => void;
  /** Switch the main view: 'editor' | 'outline' | 'board' | 'reports'. */
  setView: (name: string) => void;
}

interface HostBindings {
  getView: () => EditorView | null;
  loadDocument: (doc: HostDocument) => void;
  getDocument: () => HostDocument | null;
  setTheme: (name: string) => void;
  setView: (name: string) => void;
  exportAs: (format: 'pdf' | 'fdx' | 'fountain' | 'txt') => void;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Send a produced file to the host. Used by the exporters when running in the app. */
export async function sendFileToHost(filename: string, blob: Blob): Promise<void> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  postToHost({ type: 'export', filename, mime: blob.type || 'application/octet-stream', base64: btoa(binary) });
}

/** Parse a file's text into a host document. Exported for the browser build's importer too. */
export function documentFromText(text: string, format: 'screenplay' | 'fdx' | 'fountain' | 'txt', meta: Partial<HostDocument> = {}): HostDocument {
  let doc;
  let extracted: Partial<HostDocument> = {};
  if (format === 'screenplay') {
    try {
      const parsed = JSON.parse(text);
      return {
        title: parsed.title || meta.title || '',
        author: parsed.author || '',
        contact: parsed.contact || '',
        content: typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content || ''),
        beats: parsed.beats ?? null
      };
    } catch {
      doc = textToDoc(text);
    }
  } else if (format === 'fdx') {
    const imported = parseFDX(text);
    doc = imported.doc;
    extracted = { title: imported.title, author: imported.author, contact: imported.contact };
  } else if (format === 'fountain') {
    const imported = parseFountain(text);
    doc = imported.doc;
    extracted = { title: imported.title, author: imported.author, contact: imported.contact };
  } else {
    doc = textToDoc(text);
  }
  return {
    title: extracted.title || meta.title || '',
    author: extracted.author || meta.author || '',
    contact: extracted.contact || meta.contact || '',
    content: docToContent(doc!),
    beats: null
  };
}

/** Serialize a host document to the app's own file format. */
export function serializeDocument(doc: HostDocument): string {
  return JSON.stringify({ format: 'screenplay', version: 1, title: doc.title, author: doc.author, contact: doc.contact, content: JSON.parse(doc.content), beats: doc.beats ?? null }, null, 2);
}

/**
 * Count the rendered lines of each element by collecting the distinct line
 * boxes its text occupies, ignoring page-gap widgets inside it.
 */
function renderedLines(view: EditorView, pos: number): number {
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (!dom) return 0;
  const tops = new Set<number>();
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, {
    acceptNode: node => ((node.parentElement && node.parentElement.closest('.page-gap, .auto-contd')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  let text: Node | null;
  while ((text = walker.nextNode())) {
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width === 0 && rect.height === 0) continue;
      tops.add(Math.round(rect.top));
    }
  }
  if (tops.size === 0) return 1; // empty element still occupies a line
  return tops.size;
}

export function wrapCheck(view: EditorView): WrapCheckResult {
  const state = view.state;
  const layout = pageViewKey.getState(state)?.layout;
  const result: WrapCheckResult = { elements: state.doc.childCount, mismatches: [], lineHeightPx: PAGE.linePt * (96 / 72) };
  if (!layout) return result;
  let pos = 0;
  state.doc.forEach((node, _offset, index) => {
    const el = layout.elements[index];
    if (el && el.type !== 'page_break') {
      const engine = el.lines.length;
      const rendered = renderedLines(view, pos);
      if (engine !== rendered) result.mismatches.push({ index, type: el.type, engine, rendered, text: node.textContent.slice(0, 80) });
    }
    pos += node.nodeSize;
  });
  return result;
}

/** Install `window.__screenplay` and tell the host we are ready. */
export function installHostApi(bindings: HostBindings): void {
  const api: ScreenplayHostApi = {
    load: (text, format, meta) => {
      if (format === 'pdf') {
        const bytes = base64ToBytes(text);
        importPdf(bytes.buffer as ArrayBuffer)
          .then(imported => bindings.loadDocument({ title: imported.title || meta?.title || '', author: imported.author || '', contact: imported.contact || '', content: docToContent(imported.doc), beats: null }))
          .catch(err => postToHost({ type: 'log', message: `pdf import failed: ${err?.message || err}\n${err?.stack || ''}` }));
        return;
      }
      bindings.loadDocument(documentFromText(text, format, meta));
    },
    exportAs: format => bindings.exportAs(format),
    document: () => bindings.getDocument(),
    wrapCheck: () => {
      const view = bindings.getView();
      if (!view) return null;
      const result = wrapCheck(view);
      postToHost({ type: 'wrapCheck', result });
      return result;
    },
    setTheme: name => bindings.setTheme(name),
    setView: name => bindings.setView(name)
  };
  window.__screenplay = api;
  postToHost({ type: 'ready' });
}

export { contentToDoc };
