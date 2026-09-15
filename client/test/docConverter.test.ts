import { describe, it, expect } from 'vitest';
import { b, outline } from './helpers';
import { contentToDoc, docToContent, docToElements, contentToElements, elementsToText } from '../src/components/editor-v2/docConverter';
import { elementsToFDX } from '../src/utils/exporters';

const legacyText = `INT. KITCHEN - DAY

John enters, soaked.

JOHN
(dripping)
It's raining.

CUT TO:
`;

describe('contentToDoc', () => {
  it('imports legacy plain-text scripts element by element', () => {
    expect(outline(contentToDoc(legacyText))).toEqual([
      'scene_heading: INT. KITCHEN - DAY',
      'action: John enters, soaked.',
      'character: JOHN',
      'parenthetical: (dripping)',
      "dialogue: It's raining.",
      'transition: CUT TO:'
    ]);
  });

  it('round-trips the current JSON format', () => {
    const doc = b.doc(b.sh('INT. A - DAY'), b.ch('BOB'), b.d('Hi.'));
    expect(outline(contentToDoc(docToContent(doc)))).toEqual(outline(doc));
  });

  it('unwraps the old page-based JSON format', () => {
    const legacyJSON = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'page',
          attrs: { number: 1 },
          content: [
            { type: 'scene_heading', content: [{ type: 'text', text: 'EXT. BEACH - NIGHT' }] },
            { type: 'action', content: [{ type: 'text', text: 'Waves.' }] }
          ]
        },
        { type: 'page', attrs: { number: 2 }, content: [{ type: 'action', content: [{ type: 'text', text: 'More waves.' }] }] }
      ]
    });
    expect(outline(contentToDoc(legacyJSON))).toEqual(['scene_heading: EXT. BEACH - NIGHT', 'action: Waves.', 'action: More waves.']);
  });

  it('never throws on garbage and keeps the text visible', () => {
    expect(outline(contentToDoc('{not json'))).toEqual(['action: {not json']);
    expect(outline(contentToDoc(''))).toEqual(['action: ']);
    expect(outline(contentToDoc(undefined))).toEqual(['action: ']);
  });
});

describe('export elements', () => {
  it('produces the element list exporters expect, skipping blanks and page breaks', () => {
    const doc = b.doc(b.sh('INT. A - DAY'), b.a(''), b.pb(), b.ch('BOB'), b.d('Hi.'));
    expect(docToElements(doc)).toEqual([
      { type: 'scene-heading', text: 'INT. A - DAY' },
      { type: 'character', text: 'BOB' },
      { type: 'dialogue', text: 'Hi.' }
    ]);
  });

  it('works from stored JSON so exports of new scripts are correct', () => {
    const content = docToContent(b.doc(b.sh('INT. A - DAY'), b.ch('BOB'), b.d('Hi.')));
    const elements = contentToElements(content);
    expect(elements.map(e => e.type)).toEqual(['scene-heading', 'character', 'dialogue']);
    const fdx = elementsToFDX(elements, { title: 'Test & Co' });
    expect(fdx).toContain('<Paragraph Type="Scene Heading">');
    expect(fdx).toContain('<Paragraph Type="Dialogue">');
    expect(fdx).toContain('TEST &amp; CO');
  });

  it('renders readable indented plain text', () => {
    const text = elementsToText(contentToElements(legacyText));
    expect(text).toBe(
      [
        'INT. KITCHEN - DAY',
        '',
        'John enters, soaked.',
        '',
        '                      JOHN',
        '                (dripping)',
        "          It's raining.",
        '',
        '                                             CUT TO:',
        ''
      ].join('\n')
    );
  });
});
