import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { screenplaySchema } from '../schema/screenplaySchema';
import { TextSelection } from 'prosemirror-state';

const autoFormatKey = new PluginKey('autoFormat');

// Detect what element type the current text should be
function detectElementType(text: string, currentType: string): string | null {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  
  // Scene heading detection - as soon as INT. or EXT. is typed (with or without space)
  if (currentType === 'action' && /^(INT|EXT|EST|I\/E|E\/I)\./i.test(trimmed)) {
    return 'scene_heading';
  }
  
  // Transition detection
  if (/^(FADE IN|FADE OUT|FADE TO|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT|TIME CUT|WIPE TO|IRIS IN|IRIS OUT):?\.?$/i.test(trimmed)) {
    return 'transition';
  }
  
  // No automatic character detection - must use Tab or double Enter
  
  // No auto-detection for parentheticals - created via Tab key only
  
  // Centered text detection
  if (/^>\s*(.+)\s*<$/.test(trimmed)) {
    return 'centered';
  }
  
  return null;
}

// Format text based on element type
function formatText(text: string, elementType: string): string {
  const trimmed = text.trim();
  
  switch (elementType) {
    case 'scene_heading':
      // Ensure proper formatting for scene headings
      let formatted = trimmed.toUpperCase();
      // Add period after INT/EXT if missing
      formatted = formatted.replace(/^(INT|EXT|I\/E|E\/I)(?!\.)/, '$1.');
      // Ensure space after period
      formatted = formatted.replace(/^(INT|EXT|I\/E|E\/I)\.(?!\s)/, '$1. ');
      return formatted;
      
    case 'character':
      // Characters are always uppercase
      return trimmed.toUpperCase();
      
    case 'transition':
      // Transitions are uppercase with colon
      let trans = trimmed.toUpperCase();
      if (!trans.endsWith(':') && !trans.endsWith('.')) {
        trans += ':';
      }
      return trans;
      
    case 'centered':
      // Remove the > < markers
      const match = /^>\s*(.+)\s*<$/.exec(trimmed);
      return match ? match[1].trim() : trimmed;
      
    default:
      return text;
  }
}

export function autoFormatPlugin(): Plugin {
  let isProcessing = false;
  
  return new Plugin({
    key: autoFormatKey,
    
    appendTransaction(transactions: Transaction[], oldState, newState) {
      // Don't process if we're already processing
      if (isProcessing) {
        return null;
      }
      
      // Check if there were actual text changes
      const hasTextChange = transactions.some(tr => {
        let changed = false;
        tr.steps.forEach(step => {
          if (step.toJSON().stepType === 'replace') {
            changed = true;
          }
        });
        return changed;
      });
      
      if (!hasTextChange) {
        return null;
      }
      
      const tr = newState.tr;
      let modified = false;
      
      // Check the current selection
      const { $from } = newState.selection;
      const node = $from.parent;
      const nodeType = node.type.name;
      
      // Skip if we're in a page node
      if (nodeType === 'page') return null;
      
      // Get the current text content
      const text = node.textContent;
      
      // Detect what this should be
      const detectedType = detectElementType(text, nodeType);
      
      
      if (detectedType && detectedType !== nodeType) {
        // We need to change the node type
        const nodeStart = $from.before();
        const newNodeType = screenplaySchema.nodes[detectedType];
        
        if (newNodeType) {
          isProcessing = true;
          
          // Format the text appropriately
          const formattedText = formatText(text, detectedType);
          
          // Change the node type
          tr.setNodeMarkup(nodeStart, newNodeType);
          
          // Always update the text for scene headings to ensure capitalization
          const start = nodeStart + 1;
          const end = start + text.length;
          tr.replaceWith(start, end, screenplaySchema.text(formattedText));
          
          // Set cursor to end of formatted text
          const newPos = start + formattedText.length;
          tr.setSelection(TextSelection.create(tr.doc, newPos));
          
          modified = true;
          isProcessing = false;
        }
      } else if (detectedType === nodeType) {
        // Same type but might need formatting
        const formattedText = formatText(text, nodeType);
        
        if (formattedText !== text) {
          isProcessing = true;
          
          const nodeStart = $from.before();
          const start = nodeStart + 1;
          const end = start + text.length;
          
          tr.replaceWith(start, end, screenplaySchema.text(formattedText));
          
          // Set cursor to end of formatted text
          const newPos = start + formattedText.length;
          tr.setSelection(TextSelection.create(tr.doc, newPos));
          
          modified = true;
          isProcessing = false;
        }
      }
      
      // Auto-capitalize ONLY specific element types as you type
      if (nodeType === 'scene_heading') {
        // Always keep scene headings uppercase
        const upperText = text.toUpperCase();
        if (text !== upperText) {
          isProcessing = true;
          
          const nodeStart = $from.before();
          const start = nodeStart + 1;
          const end = start + text.length;
          
          tr.replaceWith(start, end, screenplaySchema.text(upperText));
          
          // Keep cursor at end
          const newPos = start + upperText.length;
          tr.setSelection(TextSelection.create(tr.doc, newPos));
          
          modified = true;
          isProcessing = false;
        }
      } else if (nodeType === 'character') {
        // Auto-capitalize character names as you type
        const lastChar = text.slice(-1);
        if (lastChar && lastChar !== lastChar.toUpperCase()) {
          isProcessing = true;
          
          const pos = $from.pos;
          tr.replaceWith(pos - 1, pos, screenplaySchema.text(lastChar.toUpperCase()));
          
          modified = true;
          isProcessing = false;
        }
      }
      // NO auto-capitalization for action lines!
      
      return modified ? tr : null;
    },
    
    props: {
      handleTextInput(view, from, to, text) {
        // Let the transaction go through normally
        return false;
      }
    }
  });
}

// Helper function to handle Tab on empty action lines
export function handleEmptyActionTab(state: any, dispatch: any): boolean {
  const { $from } = state.selection;
  const node = $from.parent;
  
  // Only handle empty action nodes
  if (node.type.name !== 'action' || node.content.size > 0) {
    return false;
  }
  
  if (!dispatch) return true;
  
  const tr = state.tr;
  const nodeStart = $from.before();
  
  // Convert to scene heading
  tr.setNodeMarkup(nodeStart, screenplaySchema.nodes.scene_heading);
  
  // Insert "INT. " to help the user
  tr.insertText('INT. ', nodeStart + 1);
  
  dispatch(tr.scrollIntoView());
  return true;
}