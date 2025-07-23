import { Command } from 'prosemirror-state';
import { chainCommands, exitCode } from 'prosemirror-commands';
import { screenplaySchema } from '../schema/screenplaySchema';
import { TextSelection } from 'prosemirror-state';

// Tab key command - cycle through element types
const handleTab: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const node = $from.parent;
  const nodeType = node.type.name;
  
  if (!dispatch) return true;
  
  // Don't cycle on page nodes
  if (nodeType === 'page') return false;
  
  // Special handling for when we're at the end of a node and it might create a new one
  const atEnd = $from.pos === $from.end();
  
  // Define the cycle order
  const cycleMap: Record<string, string> = {
    'action': 'character',
    'character': 'parenthetical',
    'parenthetical': 'dialogue',
    'dialogue': 'transition',
    'transition': 'scene_heading',
    'scene_heading': 'action'
  };
  
  const nextType = cycleMap[nodeType] || 'action';
  const newNodeType = screenplaySchema.nodes[nextType];
  
  if (newNodeType) {
    const tr = state.tr;
    
    if (atEnd && node.content.size === 0) {
      // If we're in an empty node, just change its type
      const nodeStart = $from.before();
      tr.setNodeMarkup(nodeStart, newNodeType);
      
      // Set cursor inside the node
      const pos = nodeStart + 1;
      tr.setSelection(TextSelection.create(tr.doc, pos));
    } else if (atEnd) {
      // We're at the end of a non-empty node, create a new node after
      const endPos = $from.after();
      const newNode = newNodeType.createAndFill();
      if (newNode) {
        tr.insert(endPos, newNode);
        // Place cursor at start of new node
        tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
      }
    } else {
      // We're in the middle of a node, just change its type
      const nodeStart = $from.before();
      tr.setNodeMarkup(nodeStart, newNodeType);
      
      // Keep cursor at current position
      const mappedPos = tr.mapping.map($from.pos);
      tr.setSelection(TextSelection.create(tr.doc, mappedPos));
    }
    
    dispatch(tr.scrollIntoView());
    return true;
  }
  
  return false;
};

// Enter key command - smart enter based on context
const handleEnter: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const node = $from.parent;
  const nodeType = node.type.name;
  
  if (!dispatch) return true;
  
  // If we're at a page node, we need to handle differently
  if (nodeType === 'page') {
    return false;
  }
  
  // Define what comes after each element type
  const flowMap: Record<string, string> = {
    'scene_heading': 'action',
    'action': 'action', // Can continue action or start character
    'character': 'dialogue',
    'parenthetical': 'dialogue',
    'dialogue': 'action',
    'transition': 'scene_heading',
    'centered': 'action'
  };
  
  const nextType = flowMap[nodeType] || 'action';
  const newNodeType = screenplaySchema.nodes[nextType];
  
  // Get the position after the current node
  const endPos = $from.end();
  
  // Create a new node and insert it
  const newNode = newNodeType.createAndFill();
  if (!newNode) return false;
  
  const tr = state.tr;
  
  // If we're at the end of the node, insert after
  if ($from.pos === endPos) {
    tr.insert(endPos + 1, newNode);
    tr.setSelection(state.selection.constructor.near(tr.doc.resolve(endPos + 2)));
  } else {
    // Split the current node
    tr.split($from.pos);
    const mappedPos = tr.mapping.map($from.pos);
    
    // Get the newly created node and change its type
    const $newPos = tr.doc.resolve(mappedPos + 1);
    if ($newPos.parent.type.name === node.type.name) {
      tr.setNodeMarkup($newPos.before(), newNodeType);
    }
    
    // Set cursor to the beginning of the new node
    tr.setSelection(state.selection.constructor.near(tr.doc.resolve(mappedPos + 1)));
  }
  
  dispatch(tr.scrollIntoView());
  return true;
};

// Shift+Tab - reverse cycle
const handleShiftTab: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const node = $from.parent;
  const nodeType = node.type.name;
  
  if (!dispatch) return true;
  
  // Don't cycle on page nodes
  if (nodeType === 'page') return false;
  
  // Define the reverse cycle order
  const reverseCycleMap: Record<string, string> = {
    'character': 'action',
    'parenthetical': 'character',
    'dialogue': 'parenthetical',
    'transition': 'dialogue',
    'scene_heading': 'transition',
    'action': 'scene_heading'
  };
  
  const prevType = reverseCycleMap[nodeType] || 'action';
  const newNodeType = screenplaySchema.nodes[prevType];
  
  if (newNodeType) {
    const tr = state.tr;
    const nodeStart = $from.before();
    
    // Change the node type
    tr.setNodeMarkup(nodeStart, newNodeType);
    
    // Place cursor at the end of the node's content
    const $nodePos = tr.doc.resolve(nodeStart);
    const nodeEnd = nodeStart + $nodePos.nodeAfter!.nodeSize - 1;
    tr.setSelection(TextSelection.create(tr.doc, nodeEnd));
    
    dispatch(tr.scrollIntoView());
    return true;
  }
  
  return false;
};

// Backspace at start of element - merge with previous
const handleBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  
  if (!empty || $from.parentOffset > 0) return false;
  
  const node = $from.parent;
  const nodeType = node.type.name;
  
  // Don't delete at start of first element in page
  if ($from.node(-1).type.name === 'page' && $from.index(-1) === 0) {
    return false;
  }
  
  if (!dispatch) return true;
  
  // Get previous node
  const before = $from.before();
  const tr = state.tr;
  
  // Delete current empty node and move to previous
  if (node.content.size === 0) {
    tr.delete(before, before + node.nodeSize);
    tr.setSelection(TextSelection.near(tr.doc.resolve(before - 1)));
  } else {
    // Just join with previous node
    tr.join(before);
  }
  
  dispatch(tr.scrollIntoView());
  return true;
};

// Export the keymap
export const screenplayKeymap = {
  'Tab': handleTab,
  'Shift-Tab': handleShiftTab,
  'Enter': chainCommands(exitCode, handleEnter),
  'Backspace': handleBackspace,
  
  // Prevent default mod-s (save) - we handle this at app level
  'Mod-s': () => true,
};