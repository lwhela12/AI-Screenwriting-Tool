import { StateField, StateEffect, Extension } from '@codemirror/state';
import { CompletionContext, Completion, autocompletion } from '@codemirror/autocomplete';

export type SmartList = 'characters' | 'locations' | 'times' | 'transitions';

interface SmartTypeData {
  characters: Set<string>;
  locations: Set<string>;
  times: Set<string>;
  transitions: Set<string>;
}

export const addSmartTypeEntry = StateEffect.define<{ list: SmartList; value: string }>();

const initialData: SmartTypeData = {
  characters: new Set<string>(),
  locations: new Set<string>(),
  times: new Set<string>(['DAY', 'NIGHT']),
  transitions: new Set<string>(['FADE IN:', 'FADE OUT.', 'CUT TO:', 'DISSOLVE TO:'])
};

const smartTypeField = StateField.define<SmartTypeData>({
  create: () => ({
    characters: new Set(initialData.characters),
    locations: new Set(initialData.locations),
    times: new Set(initialData.times),
    transitions: new Set(initialData.transitions)
  }),
  update(value, tr) {
    let updated = value;
    for (const e of tr.effects) {
      if (e.is(addSmartTypeEntry)) {
        if (updated === value) {
          updated = {
            characters: new Set(value.characters),
            locations: new Set(value.locations),
            times: new Set(value.times),
            transitions: new Set(value.transitions)
          };
        }
        updated[e.value.list].add(e.value.value.toUpperCase());
      }
    }
    return updated;
  }
});

function getCompletions(context: CompletionContext): Completion[] | null {
  const { state, pos } = context;
  const data = state.field(smartTypeField);
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const trimmed = before.trim();

  const options: Completion[] = [];

  // Scene heading prefix
  const scenePrefix = trimmed.toUpperCase();
  if (/^(I|E|INT|EXT|I\/E|E\/I)?$/.test(scenePrefix) && before === trimmed) {
    return [
      { label: 'INT.', type: 'keyword' },
      { label: 'EXT.', type: 'keyword' },
      { label: 'I/E.', type: 'keyword' }
    ];
  }

  // Locations after INT./EXT.
  const locMatch = /^(INT\.|EXT\.|I\/E\.|E\/I\.)\s+(.*)$/.exec(before.toUpperCase());
  if (locMatch) {
    const partial = locMatch[2].replace(/\s+-.*$/, '').trim();
    const from = line.from + locMatch[1].length + 1;
    data.locations.forEach(loc => {
      if (loc.startsWith(partial)) options.push({ label: loc, type: 'variable' });
    });
    return options.length ? { from, options } : null;
  }

  // Times of day after " - "
  const timeMatch = / - ([A-Z]*)$/i.exec(before);
  if (timeMatch) {
    const from = pos - timeMatch[1].length;
    data.times.forEach(t => {
      if (t.startsWith(timeMatch[1].toUpperCase())) options.push({ label: t, type: 'constant' });
    });
    return options.length ? { from, options } : null;
  }

  // Character names in uppercase at line start
  if (/^[A-Z]{1,30}$/.test(trimmed) && before === trimmed) {
    const from = line.from;
    data.characters.forEach(c => {
      if (c.startsWith(trimmed.toUpperCase())) options.push({ label: c, type: 'variable' });
    });
    return options.length ? { from, options } : null;
  }

  // Transitions at line start
  if (/^[A-Z ]{1,15}$/.test(trimmed) && before === trimmed) {
    const from = line.from;
    data.transitions.forEach(tr => {
      if (tr.startsWith(trimmed.toUpperCase())) options.push({ label: tr, type: 'keyword' });
    });
    return options.length ? { from, options } : null;
  }

  return null;
}

export function smartType(): Extension {
  return [smartTypeField, autocompletion({ override: [getCompletions] })];
}

