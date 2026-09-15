import { Command } from 'prosemirror-state';
import { chainCommands } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { ELEMENT_ORDER } from '../schema/screenplaySchema';
import { enterCommand, tabCommand, shiftTabCommand, backspaceCommand, setElementTypeCommand } from './commands';

/**
 * Keyboard bindings for the screenplay editor.
 *
 * Enter, Tab and Backspace follow Final Draft. Mod-1 through Mod-7 set the
 * element type of the current element (Scene Heading, Action, Character,
 * Parenthetical, Dialogue, Transition, Centered), in the same order as the
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
  ...Object.fromEntries(ELEMENT_ORDER.map((type, index) => [`Mod-${index + 1}`, setElementTypeCommand(type)]))
};

export { chainCommands };
