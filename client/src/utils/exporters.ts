import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ScreenplayProject } from '../components/ProjectManager';
import { ScreenplayDocument, ScreenplayData, ScreenplayElement } from './screenplayPDF';
import { contentToElements, elementsToText } from '../components/editor-v2/docConverter';

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
      elements: contentToElements(project.content)
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

const FDX_TYPES: Record<ScreenplayElement['type'], string> = {
  'scene-heading': 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition'
};

function escapeXML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Build a Final Draft XML document from export elements. */
export function elementsToFDX(elements: ScreenplayElement[], meta: { title: string; author?: string; contact?: string }): string {
  const paragraphs = elements
    .map(el => `    <Paragraph Type="${FDX_TYPES[el.type]}">\n      <Text>${escapeXML(el.text)}</Text>\n    </Paragraph>`)
    .join('\n');

  const titleLines = [meta.title.toUpperCase(), '', 'Written by', '', meta.author || '']
    .concat(meta.contact ? ['', '', ...meta.contact.split('\n')] : [])
    .map(line => `      <Paragraph Alignment="Center">\n        <Text>${escapeXML(line)}</Text>\n      </Paragraph>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paragraphs}
  </Content>
  <TitlePage>
    <Content>
${titleLines}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}

export function exportToFDX(project: ScreenplayProject): void {
  const fdx = elementsToFDX(contentToElements(project.content), project);
  downloadText(safeFilename(project.title, 'fdx'), fdx, 'application/xml');
}

export function exportToText(project: ScreenplayProject): void {
  const text = elementsToText(contentToElements(project.content));
  downloadText(safeFilename(project.title, 'txt'), text, 'text/plain');
}
