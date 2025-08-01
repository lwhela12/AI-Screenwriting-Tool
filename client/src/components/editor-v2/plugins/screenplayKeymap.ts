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
  
  // Tab on action converts to character (Final Draft behavior)
  if (nodeType === 'action') {
    const tr = state.tr;
    const nodeStart = $from.before();
    
    // Convert to character
    tr.setNodeMarkup(nodeStart, screenplaySchema.nodes.character);
    
    // If there's existing text, convert to uppercase
    if (node.content.size > 0) {
      const text = node.textContent;
      const upperText = text.toUpperCase();
      if (text !== upperText) {
        const start = nodeStart + 1;
        const end = start + text.length;
        tr.replaceWith(start, end, screenplaySchema.text(upperText));
      }
    }
    
    dispatch(tr.scrollIntoView());
    return true;
  }
  
  // Define the cycle order (matches Final Draft behavior)
  const cycleMap: Record<string, string> = {
    'scene_heading': 'action',
    // 'action' is handled separately above - always converts to character
    'character': 'parenthetical', 
    'parenthetical': 'dialogue',
    'dialogue': 'parenthetical', // Tab in dialogue creates parenthetical
    'transition': 'scene_heading',
    'centered': 'action'
  };
  
  const nextType = cycleMap[nodeType] || 'action';
  const newNodeType = screenplaySchema.nodes[nextType];
  
  if (newNodeType) {
    const tr = state.tr;
    const nodeStart = $from.before();
    
    // Special handling for creating parenthetical from character or dialogue
    if ((nodeType === 'character' || nodeType === 'dialogue') && nextType === 'parenthetical') {
      const insertPos = $from.after();
      
      // Create new parenthetical node
      const parentheticalNode = screenplaySchema.nodes.parenthetical.create({}, screenplaySchema.text('('));
      
      if (nodeType === 'dialogue' && node.content.size === 0) {
        // Empty dialogue - insert parenthetical BEFORE the dialogue
        const beforeDialogue = $from.before();
        tr.insert(beforeDialogue, parentheticalNode);
        // Move cursor to parenthetical
        tr.setSelection(TextSelection.create(tr.doc, beforeDialogue + 2)); // +2 for node + opening (
      } else {
        // Character or non-empty dialogue - insert AFTER
        tr.insert(insertPos, parentheticalNode);
        // Move cursor to parenthetical
        tr.setSelection(TextSelection.create(tr.doc, insertPos + 2)); // +2 for node + opening (
      }
      
      dispatch(tr.scrollIntoView());
      return true;
    }
    
    // Change the node type
    tr.setNodeMarkup(nodeStart, newNodeType);
    
    // For certain transitions, preserve/transform content
    if (nodeType === 'action' && nextType === 'character') {
      // Convert to uppercase for character names
      const text = node.textContent;
      if (text && text !== text.toUpperCase()) {
        const start = nodeStart + 1;
        const end = start + text.length;
        tr.replaceWith(start, end, screenplaySchema.text(text.toUpperCase()));
      }
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
  
  const tr = state.tr;
  const isEmpty = node.content.size === 0;
  
  // Special handling for empty nodes - convert to action
  if (isEmpty && nodeType !== 'action') {
    const nodeStart = $from.before();
    tr.setNodeMarkup(nodeStart, screenplaySchema.nodes.action);
    dispatch(tr.scrollIntoView());
    return true;
  }
  
  // Special handling for parentheticals - auto-close if needed
  if (nodeType === 'parenthetical') {
    const text = node.textContent;
    // Check if we need to auto-close the parenthesis
    if (text && !text.endsWith(')')) {
      const hasOpenParen = text.includes('(');
      const hasCloseParen = text.includes(')');
      
      if (hasOpenParen && !hasCloseParen) {
        // Add closing parenthesis before creating new element
        tr.insertText(')', $from.pos);
      }
    }
  }
  
  // Define what comes after each element type
  const flowMap: Record<string, string> = {
    'scene_heading': 'action',
    'action': 'action', // Continue with action
    'character': 'dialogue',
    'parenthetical': 'dialogue', 
    'dialogue': 'character', // Next speaker or action
    'transition': 'scene_heading',
    'centered': 'action'
  };
  
  // Smart detection for dialogue flow
  if (nodeType === 'dialogue' && !isEmpty) {
    // Check if next character name starts being typed (all caps)
    const text = node.textContent;
    const lastLine = text.split('\n').pop() || '';
    if (lastLine && lastLine === lastLine.toUpperCase() && lastLine.trim().length > 0) {
      // User is typing a character name, switch to character
      flowMap['dialogue'] = 'character';
    } else {
      // Default to action after dialogue
      flowMap['dialogue'] = 'action';
    }
  }
  
  const nextType = flowMap[nodeType] || 'action';
  const newNodeType = screenplaySchema.nodes[nextType];
  
  // Get the position after the current node
  const endPos = $from.end();
  
  // Create a new node
  const newNode = newNodeType.createAndFill();
  if (!newNode) return false;
  
  // If we're at the end of the node, insert after
  if ($from.pos === endPos) {
    const insertPos = $from.after();
    tr.insert(insertPos, newNode);
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  } else {
    // Split the current node
    tr.split($from.pos);
    const mappedPos = tr.mapping.map($from.pos);
    
    // Change the type of the new node
    const $newPos = tr.doc.resolve(mappedPos);
    if ($newPos.nodeAfter && $newPos.nodeAfter.type.name === nodeType) {
      const nodeAfterStart = mappedPos;
      tr.setNodeMarkup(nodeAfterStart, newNodeType);
    }
    
    // Set cursor to the beginning of the new node
    tr.setSelection(TextSelection.create(tr.doc, mappedPos + 1));
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