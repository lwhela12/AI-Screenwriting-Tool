import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ScreenplayProject } from '../components/ProjectManager';
import { ScreenplayDocument, ScreenplayData } from './screenplayPDF';
import { contentToDoc, contentToElements, elementsToText } from '../components/editor-v2/docConverter';
import { docToFDX } from './fdx';
import { docToFountain } from './fountain';
import { layoutFromDoc } from '../components/editor-v2/pagination/fromDoc';
import { isHosted, sendFileToHost } from '../host';

function notify(message: string, kind: 'info' | 'success' | 'error'): () => void {
  const el = document.createElement('div');
  el.className = `export-notification export-notification-${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  return () => {
    if (document.body.contains(el)) document.body.removeChild(el);
  };
}

function safeFilename(title: string, ext: string): string {
  const base = title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'screenplay';
  return `${base}.${ext}`;
}

function downloadBlob(filename: string, blob: Blob): void {
  if (isHosted()) {
    void sendFileToHost(filename, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, content: string, mimeType: string): void {
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

export async function exportToPDF(project: ScreenplayProject): Promise<void> {
  const dismiss = notify('Generating PDF…', 'info');
  try {
    const data: ScreenplayData = {
      title: project.title,
      author: project.author,
      contact: project.contact,
      layout: layoutFromDoc(contentToDoc(project.content)).layout
    };
    const blob = await pdf(React.createElement(ScreenplayDocument, { data }) as any).toBlob();
    downloadBlob(safeFilename(project.title, 'pdf'), blob);
    dismiss();
    const done = notify('PDF downloaded', 'success');
    setTimeout(done, 3000);
  } catch (error) {
    console.error('Error generating PDF:', error);
    dismiss();
    const done = notify('Failed to generate PDF. Please try again.', 'error');
    setTimeout(done, 5000);
  }
}

export function exportToFDX(project: ScreenplayProject): void {
  const fdx = docToFDX(contentToDoc(project.content), project);
  downloadText(safeFilename(project.title, 'fdx'), fdx, 'application/xml');
}

export function exportToFountain(project: ScreenplayProject): void {
  const text = docToFountain(contentToDoc(project.content), project);
  downloadText(safeFilename(project.title, 'fountain'), text, 'text/plain');
}

export function exportToText(project: ScreenplayProject): void {
  const text = elementsToText(contentToElements(project.content));
  downloadText(safeFilename(project.title, 'txt'), text, 'text/plain');
}
