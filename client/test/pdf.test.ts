// @vitest-environment node
import { describe, it, expect } from 'vitest';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ScreenplayDocument } from '../src/utils/screenplayPDF';
import { layoutFromDoc } from '../src/components/editor-v2/pagination/fromDoc';
import { elementsToDoc } from '../src/components/editor-v2/docConverter';
import type { ScreenplayElement } from '../src/utils/screenplayPDF';

const dialogueOf = (lines: number) => Array.from({ length: lines }, (_, i) => `dialogue line ${String(i + 1).padStart(2, '0')}.`).join('\n');

describe('PDF export', () => {
  it('renders the engine layout to a real PDF with one page per engine page plus the title page', async () => {
    const elements: ScreenplayElement[] = [
      { type: 'scene-heading', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'Bob paces.' },
      { type: 'character', text: 'BOB' },
      { type: 'dialogue', text: dialogueOf(70) },
      { type: 'transition', text: 'CUT TO:' }
    ];
    const layout = layoutFromDoc(elementsToDoc(elements)).layout;
    expect(layout.pages.length).toBe(2);

    const doc = React.createElement(ScreenplayDocument, { data: { title: 'Test', author: 'A. Writer', layout } });
    const stream: any = await pdf(doc as any).toBuffer();
    const text: string = await new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (c: any) => chunks.push(c));
      stream.on('end', () => resolve((globalThis as any).Buffer.concat(chunks).toString('latin1')));
      stream.on('error', reject);
    });
    expect(text.startsWith('%PDF')).toBe(true);
    const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pageCount).toBe(3);
  }, 30000);
});
