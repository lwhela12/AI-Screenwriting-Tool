import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node } from 'prosemirror-model';

// Lines per page in standard screenplay format
const LINES_PER_PAGE = 55;

// Calculate how many lines a node takes up
function calculateNodeLines(node: Node): number {
  const text = node.textContent;
  const nodeType = node.type.name;
  
  // Base lines from text length (assuming ~61 chars per line)
  const baseLines = Math.ceil(text.length / 61) || 1;
  
  // Add extra lines for margins
  switch (nodeType) {
    case 'scene_heading':
      return baseLines + 2; // Extra space before and after
    case 'character':
      return baseLines + 1; // Space before
    case 'transition':
      return baseLines + 2; // Space before and after
    case 'parenthetical':
    case 'dialogue':
      return baseLines;
    default:
      return baseLines + 1; // Action has space after
  }
}

// Plugin to manage page breaks and numbering
export const pageViewPlugin = new Plugin({
  state: {
    init(config, state) {
      return DecorationSet.empty;
    },
    
    apply(tr, decorations, oldState, newState) {
      // Only recalculate if document changed
      if (!tr.docChanged) return decorations;
      
      const pageBreaks: Decoration[] = [];
      let currentLines = 0;
      let currentPage = 1;
      let nodePos = 0;
      
      // Iterate through all nodes in the document
      newState.doc.forEach((pageNode, pageOffset) => {
        if (pageNode.type.name === 'page') {
          // Update page number attribute if needed
          if (pageNode.attrs.number !== currentPage) {
            // We'll handle this in a transaction later
          }
          
          // Check content within the page
          let linesInPage = 0;
          pageNode.forEach((node, offset) => {
            const lines = calculateNodeLines(node);
            linesInPage += lines;
            
            // If we exceed page limit, we need a page break
            if (linesInPage > LINES_PER_PAGE && offset > 0) {
              // Add decoration for page break indicator
              const breakPos = pageOffset + offset;
              pageBreaks.push(
                Decoration.widget(breakPos, () => {
                  const div = document.createElement('div');
                  div.className = 'page-break-indicator';
                  div.textContent = '--- Page Break ---';
                  return div;
                })
              );
            }
          });
          
          currentPage++;
        }
      });
      
      return DecorationSet.create(newState.doc, pageBreaks);
    }
  },
  
  props: {
    decorations(state) {
      return this.getState(state);
    }
  }
});