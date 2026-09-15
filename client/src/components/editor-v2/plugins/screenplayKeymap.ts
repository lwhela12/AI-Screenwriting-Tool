import { Command } from 'prosemirror-state';
import { chainCommands } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { ELEMENT_ORDER } from '../schema/screenplaySchema';
import { enterCommand, tabCommand, shiftTabCommand, backspaceCommand, setElementTypeCommand, toggleDualDialogue } from './commands';
import { openSearch, findNext, findPrevious } from './search';

/**
 * Keyboard bindings for the screenplay editor.
 *
 * Enter, Tab and Backspace follow Final Draft. Mod-1 through Mod-8 set the
 * element type of the current element (Scene Heading, Action, Character,
 * Parenthetical, Dialogue, Transition, Shot, Centered), in the same order as the
 * element menu. Save (Mod-S) is deliberately not bound here; the application
 * handles it at the window level so it works wherever focus is.
 */
export const screenplayKeymap: Record<string, Command> = {
  Enter: enterCommand,
  Tab: tabCommand,
  'Shift-Tab': shiftTabCommand,
  Backspace: backspaceCommand,
  'Mod-z': undo,
  'Mod-y': redo,
  'Shift-Mod-z': redo,
  'Shift-Mod-d': toggleDualDialogue,
  'Mod-f': openSearch,
  'Mod-g': findNext,
  'Shift-Mod-g': findPrevious,
  ...Object.fromEntries(ELEMENT_ORDER.map((type, index) => [`Mod-${index + 1}`, setElementTypeCommand(type)]))
};

export { chainCommands };
