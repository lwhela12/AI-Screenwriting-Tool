import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { Layout, Row, COLUMNS, PAGE } from '../components/editor-v2/pagination/layout';

/**
 * PDF output. Every printed line comes from the pagination engine, already
 * wrapped and paginated, so the PDF matches the editor page for page. Each
 * row is placed on the 12pt Courier grid by absolute position; nothing here
 * re-wraps text.
 */

export interface ScreenplayElement {
  type: 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition';
  text: string;
}

export interface ScreenplayData {
  title: string;
  author?: string;
  contact?: string;
  layout: Layout;
}

const PT_PER_IN = 72;
const CHAR_PT = 7.2; // 10 characters per inch
const LEFT = PAGE.leftMarginIn * PT_PER_IN;
const RIGHT_EDGE = (PAGE.widthIn - PAGE.rightMarginIn) * PT_PER_IN;
const TOP = PAGE.topMarginIn * PT_PER_IN;

const pageStyle = {
  fontFamily: 'Courier',
  fontSize: PAGE.linePt,
  lineHeight: 1,
  backgroundColor: '#fff'
} as const;

function rowLeft(row: Row): number {
  const col = COLUMNS[row.column];
  const widthPt = row.text.length * CHAR_PT;
  if (col.align === 'right') return RIGHT_EDGE - widthPt;
  if (col.align === 'center') return (LEFT + RIGHT_EDGE) / 2 - widthPt / 2;
  return LEFT + col.indent * CHAR_PT;
}

const PrintedRow: React.FC<{ row: Row; index: number }> = ({ row, index }) => {
  if (row.kind === 'blank' || row.text === '') return null;
  return (
    <Text
      style={{
        position: 'absolute',
        top: TOP + index * PAGE.linePt,
        left: rowLeft(row),
        width: RIGHT_EDGE - LEFT + CHAR_PT * 4,
        fontFamily: 'Courier'
      }}
    >
      {row.text}
    </Text>
  );
};

const PageNumber: React.FC<{ number: number }> = ({ number }) => {
  const text = `${number}.`;
  return (
    <Text
      style={{
        position: 'absolute',
        top: PAGE.pageNumberTopIn * PT_PER_IN,
        left: RIGHT_EDGE - text.length * CHAR_PT,
        fontFamily: 'Courier'
      }}
    >
      {text}
    </Text>
  );
};

const TitlePage: React.FC<{ title: string; author?: string; contact?: string }> = ({ title, author, contact }) => (
  <Page size="LETTER" style={pageStyle}>
    <View style={{ position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center' }}>
      <Text style={{ marginBottom: 36, textTransform: 'uppercase' }}>{title}</Text>
      {author ? (
        <>
          <Text style={{ marginBottom: 12 }}>Written by</Text>
          <Text>{author}</Text>
        </>
      ) : null}
    </View>
    {contact ? (
      <View style={{ position: 'absolute', bottom: PAGE.topMarginIn * PT_PER_IN, left: LEFT }}>
        {contact.split('\n').map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </View>
    ) : null}
  </Page>
);

export const ScreenplayDocument: React.FC<{ data: ScreenplayData }> = ({ data }) => (
  <Document title={data.title} author={data.author}>
    <TitlePage title={data.title} author={data.author} contact={data.contact} />
    {data.layout.pages.map(page => (
      <Page key={page.number} size="LETTER" style={pageStyle}>
        {page.number > 1 ? <PageNumber number={page.number} /> : null}
        {page.rows.map((row, i) => (
          <PrintedRow key={i} row={row} index={i} />
        ))}
      </Page>
    ))}
  </Document>
);
