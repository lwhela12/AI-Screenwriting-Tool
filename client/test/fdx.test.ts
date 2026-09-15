import { describe, it, expect } from 'vitest';
import { eq } from 'prosemirror-test-builder';
import { outline } from './helpers';
import { parseFDX, docToFDX } from '../src/utils/fdx';

const sample = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading" Number="1">
      <SceneProperties Length="1 1/8" Page="1" Title=""/>
      <Text>INT. KITCHEN - DAY</Text>
    </Paragraph>
    <Paragraph Type="Action">
      <Text>John enters, </Text>
      <Text Style="Italic">soaked</Text>
      <Text>. He drops his </Text>
      <Text Style="Bold+Underline">keys</Text>
      <Text>.</Text>
    </Paragraph>
    <Paragraph Type="Character">
      <Text>JOHN (V.O.)</Text>
    </Paragraph>
    <Paragraph Type="Parenthetical">
      <Text>(dripping)</Text>
    </Paragraph>
    <Paragraph Type="Dialogue">
      <Text>It's raining.</Text>
    </Paragraph>
    <DualDialogue>
      <Paragraph Type="Character">
        <Text>MARY</Text>
      </Paragraph>
      <Paragraph Type="Dialogue">
        <Text>Told you.</Text>
      </Paragraph>
      <Paragraph Type="Character">
        <Text>JOHN</Text>
      </Paragraph>
      <Paragraph Type="Dialogue">
        <Text>You did.</Text>
      </Paragraph>
    </DualDialogue>
    <Paragraph Type="Shot">
      <Text>CLOSE ON THE KEYS</Text>
    </Paragraph>
    <Paragraph Type="Transition">
      <Text>CUT TO:</Text>
    </Paragraph>
    <Paragraph Type="Scene Heading" Number="A2" StartsNewPage="Yes">
      <Text>EXT. STREET - NIGHT</Text>
    </Paragraph>
    <Paragraph Type="Action" Alignment="Center">
      <Text>THE END</Text>
    </Paragraph>
    <Paragraph Type="General">
      <Text>A general note.</Text>
    </Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center">
        <Text>RAIN</Text>
      </Paragraph>
      <Paragraph Alignment="Center">
        <Text></Text>
      </Paragraph>
      <Paragraph Alignment="Center">
        <Text>Written by</Text>
      </Paragraph>
      <Paragraph Alignment="Center">
        <Text></Text>
      </Paragraph>
      <Paragraph Alignment="Center">
        <Text>Jane Writer</Text>
      </Paragraph>
      <Paragraph Alignment="Left">
        <Text></Text>
      </Paragraph>
      <Paragraph Alignment="Left">
        <Text>jane@example.com</Text>
      </Paragraph>
      <Paragraph Alignment="Left">
        <Text>555-0100</Text>
      </Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>
`;

describe('parseFDX', () => {
  it('maps every paragraph type and keeps attributes', () => {
    const { doc } = parseFDX(sample);
    expect(outline(doc)).toEqual([
      'scene_heading: INT. KITCHEN - DAY',
      'action: John enters, soaked. He drops his keys.',
      'character: JOHN (V.O.)',
      'parenthetical: (dripping)',
      "dialogue: It's raining.",
      'character: MARY',
      'dialogue: Told you.',
      'character: JOHN',
      'dialogue: You did.',
      'shot: CLOSE ON THE KEYS',
      'transition: CUT TO:',
      'page_break: ',
      'scene_heading: EXT. STREET - NIGHT',
      'centered: THE END',
      'action: A general note.'
    ]);
    expect(doc.child(0).attrs.number).toBe('1');
    expect(doc.child(12).attrs.number).toBe('A2');
    expect(doc.child(5).attrs.dual).toBe('left');
    expect(doc.child(7).attrs.dual).toBe('right');
    expect(doc.child(2).attrs.dual).toBeNull();
  });

  it('keeps bold, italic and underline as marks', () => {
    const { doc } = parseFDX(sample);
    const action = doc.child(1);
    const marks = (i: number) => action.child(i).marks.map(m => m.type.name).sort();
    expect(marks(1)).toEqual(['italic']);
    expect(marks(3)).toEqual(['bold', 'underline']);
    expect(marks(0)).toEqual([]);
  });

  it('reads the title page', () => {
    const { title, author, contact } = parseFDX(sample);
    expect(title).toBe('RAIN');
    expect(author).toBe('Jane Writer');
    expect(contact).toBe('jane@example.com\n555-0100');
  });

  it('rejects files that are not Final Draft documents', () => {
    expect(() => parseFDX('<html></html>')).toThrow(/not a Final Draft/);
    expect(() => parseFDX('<FinalDraft><Content>')).toThrow(/not valid XML/);
  });

  it('capitalises cues, headings, shots and transitions stored in typed case', () => {
    const { doc } = parseFDX(
      '<FinalDraft DocumentType="Script"><Content>' +
        '<Paragraph Type="Scene Heading"><Text>Ext. Space - night</Text></Paragraph>' +
        '<Paragraph Type="Character"><Text>Joe</Text></Paragraph>' +
        '<Paragraph Type="Dialogue"><Text>Keep my case.</Text></Paragraph>' +
        '</Content></FinalDraft>'
    );
    expect(outline(doc)).toEqual(['scene_heading: EXT. SPACE - NIGHT', 'character: JOE', 'dialogue: Keep my case.']);
  });

  it('tolerates an empty script', () => {
    const { doc } = parseFDX('<FinalDraft DocumentType="Script"><Content></Content></FinalDraft>');
    expect(outline(doc)).toEqual(['action: ']);
  });
});

describe('docToFDX round trip', () => {
  it('re-imports to an identical document', () => {
    const first = parseFDX(sample);
    const xml = docToFDX(first.doc, { title: first.title || '', author: first.author, contact: first.contact });
    const second = parseFDX(xml);
    expect(eq(second.doc, first.doc)).toBe(true);
    expect(second.title).toBe('RAIN');
    expect(second.author).toBe('Jane Writer');
    expect(second.contact).toBe('jane@example.com\n555-0100');
  });

  it('writes Final Draft attributes', () => {
    const xml = docToFDX(parseFDX(sample).doc, { title: 'x' });
    expect(xml).toContain('<Paragraph Type="Scene Heading" Number="1">');
    expect(xml).toContain('<Paragraph Type="Scene Heading" Number="A2" StartsNewPage="Yes">');
    expect(xml).toContain('<Paragraph Type="Action" Alignment="Center">');
    expect(xml).toContain('<Paragraph Type="Shot">');
    expect(xml).toContain('<Text Style="Bold+Underline">keys</Text>');
    expect(xml).toContain('<DualDialogue>');
    expect((xml.match(/<DualDialogue>/g) || []).length).toBe(1);
  });
});
