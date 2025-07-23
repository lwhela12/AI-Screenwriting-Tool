import { InputRule, inputRules } from 'prosemirror-inputrules';
import { screenplaySchema } from '../schema/screenplaySchema';

// Auto-capitalize character names
export const characterCapitalize = new InputRule(
  /^([A-Z][A-Z\s]+)$/,
  (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== 'character') return null;
    
    return state.tr.insertText(match[1].toUpperCase(), start, end);
  }
);

// Auto-format scene headings
export const sceneHeadingFormat = new InputRule(
  /^(INT|EXT|EST|I\/E)\.?\s+(.*)$/i,
  (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== 'scene_heading') return null;
    
    const prefix = match[1].toUpperCase();
    const location = match[2].toUpperCase();
    return state.tr.insertText(`${prefix}. ${location}`, start, end);
  }
);

// Auto-format transitions
export const transitionFormat = new InputRule(
  /^(FADE IN|FADE OUT|FADE TO|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT):?$/i,
  (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== 'transition') return null;
    
    const transition = match[1].toUpperCase();
    return state.tr.insertText(`${transition}:`, start, end);
  }
);

// Create input rules plugin
export function createInputRules() {
  return inputRules({
    rules: [
      characterCapitalize,
      sceneHeadingFormat,
      transitionFormat
    ]
  });
}