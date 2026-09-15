import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { Layout, Row, PAGE, CHAR_PT, columnFor } from '../components/editor-v2/pagination/layout';

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
/** Built-in Courier advances 7.2pt; letter-spacing brings it to Final Draft's 7pt. */
const LETTER_SPACING = CHAR_PT - 7.2;
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
  const col = columnFor(row.column, row.dual);
  const widthPt = row.text.length * CHAR_PT;
  if (col.align === 'right') return RIGHT_EDGE - widthPt;
  if (col.align === 'center') return (LEFT + RIGHT_EDGE) / 2 - widthPt / 2;
  const hang = row.lineIndex === 0 && col.hang ? col.hang : 0;
  return LEFT + (col.indent - hang) * CHAR_PT;
}

/** Vertical position of a row: body rows count down the page; margin rows sit outside the body. */
function rowTop(row: Row, bodyIndex: number): number {
  if (row.kind === 'contd') return TOP - PAGE.linePt;
  return TOP + bodyIndex * PAGE.linePt;
}

const PrintedRow: React.FC<{ row: Row; index: number }> = ({ row, index }) => {
  if (row.kind === 'dual') {
    return (
      <>
        {row.left ? <PrintedRow row={row.left} index={index} /> : null}
        {row.right ? <PrintedRow row={row.right} index={index} /> : null}
      </>
    );
  }
  if (row.kind === 'blank' || row.text === '') return null;
  return (
    <Text
      style={{
        position: 'absolute',
        top: rowTop(row, index),
        left: rowLeft(row),
        width: RIGHT_EDGE - LEFT + CHAR_PT * 4,
        fontFamily: 'Courier',
        letterSpacing: LETTER_SPACING
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
        fontFamily: 'Courier',
        letterSpacing: LETTER_SPACING
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
        {(() => {
          let body = 0;
          return page.rows.map((row, i) => {
            const el = <PrintedRow key={i} row={row} index={body} />;
            if (!row.free) body++;
            return el;
          });
        })()}
      </Page>
    ))}
  </Document>
);
