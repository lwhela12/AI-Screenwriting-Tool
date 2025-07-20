import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, PDFDownloadLink } from '@react-pdf/renderer';

// Hollywood standard screenplay formatting specifications
const SCREENPLAY_SPECS = {
  pageWidth: 612, // 8.5 inches in points
  pageHeight: 792, // 11 inches in points
  margins: {
    top: 72, // 1 inch
    bottom: 72, // 1 inch
    left: 108, // 1.5 inches
    right: 72, // 1 inch
  },
  elements: {
    action: {
      left: 108, // 1.5 inches (same as left margin)
      right: 72, // 1 inch from right
    },
    character: {
      left: 266.4, // 3.7 inches from left edge
    },
    dialogue: {
      left: 180, // 2.5 inches from left edge
      right: 144, // 2 inches from right edge
    },
    parenthetical: {
      left: 223.2, // 3.1 inches from left edge
      right: 216, // 3 inches from right edge
    },
    sceneHeading: {
      left: 108, // 1.5 inches (same as left margin)
      right: 72, // 1 inch from right
    },
    transition: {
      left: 432, // 6 inches from left edge (right-aligned)
    },
  },
  font: {
    family: 'Courier',
    size: 12,
    lineHeight: 1,
  },
  spacing: {
    betweenElements: 12, // Double space between elements
    withinElement: 0, // Single space within elements
  },
};

// Register Courier font (built-in)
Font.register({
  family: 'Courier',
  fonts: [
    { src: 'Courier' },
    { src: 'Courier-Bold', fontWeight: 'bold' },
  ],
});

// Create styles
const styles = StyleSheet.create({
  page: {
    backgroundColor: 'white',
    fontFamily: 'Courier',
    fontSize: SCREENPLAY_SPECS.font.size,
    lineHeight: SCREENPLAY_SPECS.font.lineHeight,
    paddingTop: SCREENPLAY_SPECS.margins.top,
    paddingBottom: SCREENPLAY_SPECS.margins.bottom,
    paddingLeft: 0,
    paddingRight: 0,
  },
  pageNumber: {
    position: 'absolute',
    top: 36, // 0.5 inch from top
    right: SCREENPLAY_SPECS.margins.right,
    fontSize: SCREENPLAY_SPECS.font.size,
  },
  sceneHeading: {
    marginLeft: SCREENPLAY_SPECS.elements.sceneHeading.left,
    marginRight: SCREENPLAY_SPECS.elements.sceneHeading.right,
    marginBottom: SCREENPLAY_SPECS.spacing.betweenElements,
    textTransform: 'uppercase',
  },
  action: {
    marginLeft: SCREENPLAY_SPECS.elements.action.left,
    marginRight: SCREENPLAY_SPECS.elements.action.right,
    marginBottom: SCREENPLAY_SPECS.spacing.betweenElements,
    textAlign: 'left',
  },
  character: {
    marginLeft: SCREENPLAY_SPECS.elements.character.left,
    marginBottom: SCREENPLAY_SPECS.spacing.withinElement,
    textTransform: 'uppercase',
  },
  dialogue: {
    marginLeft: SCREENPLAY_SPECS.elements.dialogue.left,
    marginRight: SCREENPLAY_SPECS.elements.dialogue.right,
    marginBottom: SCREENPLAY_SPECS.spacing.betweenElements,
    textAlign: 'left',
  },
  parenthetical: {
    marginLeft: SCREENPLAY_SPECS.elements.parenthetical.left,
    marginRight: SCREENPLAY_SPECS.elements.parenthetical.right,
    marginBottom: SCREENPLAY_SPECS.spacing.withinElement,
  },
  transition: {
    marginLeft: SCREENPLAY_SPECS.elements.transition.left,
    marginBottom: SCREENPLAY_SPECS.spacing.betweenElements,
    textTransform: 'uppercase',
  },
});

// Types for screenplay elements
export interface ScreenplayElement {
  type: 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition';
  text: string;
}

export interface ScreenplayData {
  title: string;
  author?: string;
  contact?: string;
  elements: ScreenplayElement[];
}

// Component for rendering screenplay elements
const ScreenplayElement: React.FC<{ element: ScreenplayElement }> = ({ element }) => {
  switch (element.type) {
    case 'scene-heading':
      return <Text style={styles.sceneHeading}>{element.text}</Text>;
    case 'action':
      return <Text style={styles.action}>{element.text}</Text>;
    case 'character':
      return <Text style={styles.character}>{element.text}</Text>;
    case 'dialogue':
      return <Text style={styles.dialogue}>{element.text}</Text>;
    case 'parenthetical':
      return <Text style={styles.parenthetical}>{element.text}</Text>;
    case 'transition':
      return <Text style={styles.transition}>{element.text}</Text>;
    default:
      return null;
  }
};

// Title page component
const TitlePage: React.FC<{ title: string; author?: string; contact?: string }> = ({ title, author, contact }) => (
  <Page size="LETTER" style={styles.page}>
    <View style={{ flex: 1, position: 'relative' }}>
      {/* Centered title and author */}
      <View style={{ 
        position: 'absolute',
        top: '40%',
        left: 0,
        right: 0,
        alignItems: 'center',
        transform: [{ translateY: -50 }]
      }}>
        <Text style={{ fontSize: 24, marginBottom: 48, textTransform: 'uppercase' }}>
          {title}
        </Text>
        {author && (
          <>
            <Text style={{ marginBottom: 12 }}>by</Text>
            <Text>{author}</Text>
          </>
        )}
      </View>
      
      {/* Contact information at bottom left */}
      {contact && (
        <View style={{
          position: 'absolute',
          bottom: 72,
          left: 108,
        }}>
          {contact.split('\n').map((line, index) => (
            <Text key={index} style={{ marginBottom: 6 }}>{line}</Text>
          ))}
        </View>
      )}
    </View>
  </Page>
);

// Screenplay document component with proper page breaking
export const ScreenplayDocument: React.FC<{ data: ScreenplayData }> = ({ data }) => {
  // Calculate lines per element for page breaking
  const getLinesForElement = (element: ScreenplayElement): number => {
    const avgCharsPerLine = 60; // Approximate for Courier 12pt
    const textLength = element.text.length;
    const baseLines = Math.ceil(textLength / avgCharsPerLine);
    
    // Add extra lines for spacing between elements
    switch (element.type) {
      case 'scene-heading':
      case 'transition':
        return baseLines + 2; // Extra space after
      case 'character':
        return 1; // Character names are single line
      case 'parenthetical':
        return 1; // Parentheticals are typically short
      case 'dialogue':
        return baseLines + 1; // Some spacing after
      case 'action':
        return baseLines + 1;
      default:
        return baseLines;
    }
  };

  // Group elements by page with proper page breaking
  const pages: ScreenplayElement[][] = [];
  let currentPage: ScreenplayElement[] = [];
  let currentPageLines = 0;
  const maxLinesPerPage = 55; // Hollywood standard

  data.elements.forEach((element, index) => {
    const elementLines = getLinesForElement(element);
    
    // Check if we need a new page
    if (currentPageLines + elementLines > maxLinesPerPage && currentPage.length > 0) {
      // Don't break in the middle of dialogue
      if (element.type === 'dialogue' || element.type === 'parenthetical') {
        // Look back to find the character name
        let moveIndex = currentPage.length - 1;
        while (moveIndex >= 0 && currentPage[moveIndex].type !== 'character') {
          moveIndex--;
        }
        
        if (moveIndex >= 0) {
          // Move character and subsequent dialogue to next page
          const elementsToMove = currentPage.splice(moveIndex);
          pages.push(currentPage);
          currentPage = elementsToMove;
          currentPageLines = elementsToMove.reduce((sum, el) => sum + getLinesForElement(el), 0);
        } else {
          // No character found, just start new page
          pages.push(currentPage);
          currentPage = [];
          currentPageLines = 0;
        }
      } else {
        // Safe to break here
        pages.push(currentPage);
        currentPage = [];
        currentPageLines = 0;
      }
    }
    
    currentPage.push(element);
    currentPageLines += elementLines;
  });

  // Don't forget the last page
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return (
    <Document>
      <TitlePage title={data.title} author={data.author} contact={data.contact} />
      {pages.map((pageElements, pageIndex) => (
        <Page key={pageIndex} size="LETTER" style={styles.page}>
          {pageIndex > 0 && (
            <Text style={styles.pageNumber}>{pageIndex + 1}.</Text>
          )}
          {pageElements.map((element, elementIndex) => (
            <ScreenplayElement key={`${pageIndex}-${elementIndex}`} element={element} />
          ))}
        </Page>
      ))}
    </Document>
  );
};

// Export component for download link
export const ScreenplayPDFDownloadLink: React.FC<{
  data: ScreenplayData;
  fileName?: string;
  children: React.ReactNode;
}> = ({ data, fileName = 'screenplay.pdf', children }) => (
  <PDFDownloadLink document={<ScreenplayDocument data={data} />} fileName={fileName}>
    {({ blob, url, loading, error }) =>
      loading ? 'Generating PDF...' : children
    }
  </PDFDownloadLink>
);

// Utility function to convert script text to screenplay elements
export function parseScriptToElements(scriptText: string): ScreenplayElement[] {
  const lines = scriptText.split('\n');
  const elements: ScreenplayElement[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Simple parsing logic - this would need to be more sophisticated in a real implementation
    if (trimmedLine === trimmedLine.toUpperCase() && trimmedLine.includes('.')) {
      // Scene heading (e.g., "INT. HOUSE - DAY")
      elements.push({ type: 'scene-heading', text: trimmedLine });
    } else if (trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length < 30) {
      // Character name or transition
      if (trimmedLine.endsWith(':') || trimmedLine.includes('CUT TO')) {
        elements.push({ type: 'transition', text: trimmedLine });
      } else {
        elements.push({ type: 'character', text: trimmedLine });
      }
    } else if (trimmedLine.startsWith('(') && trimmedLine.endsWith(')')) {
      // Parenthetical
      elements.push({ type: 'parenthetical', text: trimmedLine });
    } else {
      // Action or dialogue - would need context to determine which
      // For now, we'll assume it's action unless it follows a character name
      const lastElement = elements[elements.length - 1];
      if (lastElement && lastElement.type === 'character') {
        elements.push({ type: 'dialogue', text: trimmedLine });
      } else {
        elements.push({ type: 'action', text: trimmedLine });
      }
    }
  }
  
  return elements;
}