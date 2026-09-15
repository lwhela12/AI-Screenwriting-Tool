import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';

export type SmartList = 'characters' | 'locations' | 'times' | 'transitions';

export interface SmartTypeData {
  characters: Set<string>;
  locations: Set<string>;
  times: Set<string>;
  transitions: Set<string>;
}

interface CompletionItem {
  label: string;
  /** What to insert after the label when it is accepted. */
  suffix: string;
}

export interface CompletionState {
  active: boolean;
  from: number;
  to: number;
  options: CompletionItem[];
  selected: number;
}

const INACTIVE: CompletionState = { active: false, from: 0, to: 0, options: [], selected: 0 };

export const smartTypeKey = new PluginKey<SmartTypeData>('smartType');
export const completionKey = new PluginKey<CompletionState>('completion');

const DEFAULT_TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME'];
const DEFAULT_TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE OUT.', 'FADE TO BLACK.', 'TIME CUT TO:', 'FADE IN:'];
const SCENE_PREFIXES = ['INT.', 'EXT.', 'I/E.', 'EST.'];
const EXTENSIONS = ['V.O.', 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'FILTERED', 'ON PHONE', 'INTO PHONE', 'SUBTITLED'];

const SCENE_HEADING_RE = /^(INT\.|EXT\.|I\/E\.|E\/I\.|EST\.)\s*(.*)$/i;

function stripExtension(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Collect SmartType entries from a whole document. */
export function harvest(doc: PMNode, into: SmartTypeData): boolean {
  let changed = false;
  doc.forEach(node => {
    const text = node.textContent.trim();
    if (!text) return;
    if (node.type.name === 'character') {
      const name = stripExtension(text).toUpperCase();
      if (name && !into.characters.has(name)) {
        into.characters.add(name);
        changed = true;
      }
    } else if (node.type.name === 'scene_heading') {
      const m = SCENE_HEADING_RE.exec(text);
      if (m) {
        const [locationPart, timePart] = m[2].split(/\s+-\s+/);
        const location = (locationPart || '').trim().toUpperCase();
        if (location && !into.locations.has(location)) {
          into.locations.add(location);
          changed = true;
        }
        const time = (timePart || '').trim().toUpperCase();
        if (time && !into.times.has(time)) {
          into.times.add(time);
          changed = true;
        }
      }
    } else if (node.type.name === 'transition') {
      const t = text.toUpperCase();
      if (!into.transitions.has(t)) {
        into.transitions.add(t);
        changed = true;
      }
    }
  });
  return changed;
}

function freshData(): SmartTypeData {
  return {
    characters: new Set(),
    locations: new Set(),
    times: new Set(DEFAULT_TIMES),
    transitions: new Set(DEFAULT_TRANSITIONS)
  };
}

/**
 * Keeps the SmartType lists (characters, locations, times, transitions)
 * up to date from the document. Entries are only ever harvested from the
 * element they belong to, so an all-caps sound effect in an action line
 * never becomes a "character".
 */
export function smartTypePlugin(): Plugin<SmartTypeData> {
  return new Plugin<SmartTypeData>({
    key: smartTypeKey,
    state: {
      init(_config, state) {
        const data = freshData();
        harvest(state.doc, data);
        return data;
      },
      apply(tr, data) {
        const manual = tr.getMeta(smartTypeKey) as SmartTypeData | undefined;
        if (manual) return manual;
        if (!tr.docChanged) return data;
        const next: SmartTypeData = {
          characters: new Set(data.characters),
          locations: new Set(data.locations),
          times: new Set(data.times),
          transitions: new Set(data.transitions)
        };
        return harvest(tr.doc, next) ? next : data;
      }
    }
  });
}

function matches(list: Set<string>, partial: string, suffix = ''): CompletionItem[] {
  const upper = partial.toUpperCase();
  const options: CompletionItem[] = [];
  list.forEach(entry => {
    if (entry.startsWith(upper) && entry !== upper) options.push({ label: entry, suffix });
  });
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

function completionsAt(state: EditorState): CompletionState | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;
  const data = smartTypeKey.getState(state);
  if (!data) return null;

  const parent = $from.parent;
  const typeName = parent.type.name;
  const textBefore = parent.textContent.slice(0, $from.parentOffset);
  const nodeStart = $from.start();

  if (typeName === 'scene_heading') {
    const prefixPartial = /^(I|IN|INT|E|EX|EXT|ES|EST|I\/|I\/E)$/i.exec(textBefore.trim());
    if (prefixPartial && textBefore.trim().length > 0) {
      const options = SCENE_PREFIXES.filter(p => p.startsWith(textBefore.trim().toUpperCase())).map(label => ({ label, suffix: ' ' }));
      if (options.length) return { active: true, from: nodeStart, to: $from.pos, options, selected: 0 };
      return null;
    }

    const m = SCENE_HEADING_RE.exec(textBefore);
    if (!m) return null;
    const rest = m[2];
    const dash = rest.search(/\s-\s?/);
    if (dash === -1) {
      if (!rest.trim()) return null;
      const from = $from.pos - rest.length;
      const options = matches(data.locations, rest.trim(), ' - ');
      return options.length ? { active: true, from, to: $from.pos, options, selected: 0 } : null;
    }
    const timePartial = rest.slice(dash).replace(/^\s-\s?/, '');
    if (!timePartial.length) return null;
    const from = $from.pos - timePartial.length;
    const options = matches(data.times, timePartial);
    return options.length ? { active: true, from, to: $from.pos, options, selected: 0 } : null;
  }

  if (typeName === 'character') {
    const text = parent.textContent;
    if (!text.trim() || $from.parentOffset !== text.length) return null;
    const open = text.lastIndexOf('(');
    if (open >= 0) {
      // Typing an extension such as (V.O.): offer the standard list until it is closed.
      if (text.indexOf(')', open) >= 0) return null;
      const partial = text.slice(open + 1).toUpperCase();
      const options = EXTENSIONS.filter(e => e.startsWith(partial) && e !== partial).map(label => ({ label, suffix: ')' }));
      return options.length ? { active: true, from: nodeStart + open + 1, to: nodeStart + text.length, options, selected: 0 } : null;
    }
    const options = matches(data.characters, text);
    return options.length ? { active: true, from: nodeStart, to: nodeStart + text.length, options, selected: 0 } : null;
  }

  if (typeName === 'transition') {
    const text = parent.textContent;
    if (!text.trim() || $from.parentOffset !== text.length) return null;
    const options = matches(data.transitions, text);
    return options.length ? { active: true, from: nodeStart, to: nodeStart + text.length, options, selected: 0 } : null;
  }

  return null;
}

function applyCompletion(view: EditorView, completion: CompletionState) {
  const option = completion.options[completion.selected];
  if (!option) return;
  const tr = view.state.tr;
  tr.insertText(option.label + option.suffix, completion.from, completion.to);
  tr.setMeta(completionKey, INACTIVE);
  view.dispatch(tr);
  view.focus();
}

/**
 * SmartType completion dropdown. Suggestions appear while typing in a scene
 * heading, character or transition. Tab or Enter accepts, Escape dismisses,
 * arrow keys move the highlight. Accepting INT./EXT. adds a space and
 * accepting a location adds " - " so the writer can go straight on to the
 * time of day, matching Final Draft.
 */
export function completionPlugin(): Plugin<CompletionState> {
  let dropdown: HTMLElement | null = null;

  return new Plugin<CompletionState>({
    key: completionKey,

    state: {
      init: () => INACTIVE,
      apply(tr, state, _old, newState) {
        const meta = tr.getMeta(completionKey) as CompletionState | undefined;
        if (meta) return meta;
        if (tr.docChanged) return completionsAt(newState) || INACTIVE;
        if (tr.selectionSet) return INACTIVE;
        return state;
      }
    },

    props: {
      handleKeyDown(view, event) {
        const completion = completionKey.getState(view.state);
        if (!completion?.active || completion.options.length === 0) return false;
        const count = completion.options.length;

        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, { ...completion, selected: (completion.selected + 1) % count }));
            return true;
          case 'ArrowUp':
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, { ...completion, selected: (completion.selected - 1 + count) % count }));
            return true;
          case 'Tab':
          case 'Enter':
            event.preventDefault();
            applyCompletion(view, completion);
            return true;
          case 'Escape':
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, INACTIVE));
            return true;
        }
        return false;
      },

      handleDOMEvents: {
        blur(view) {
          const completion = completionKey.getState(view.state);
          if (completion?.active) view.dispatch(view.state.tr.setMeta(completionKey, INACTIVE));
          return false;
        }
      }
    },

    view() {
      return {
        update(view) {
          const completion = completionKey.getState(view.state);
          if (!completion?.active || completion.options.length === 0) {
            if (dropdown) {
              dropdown.remove();
              dropdown = null;
            }
            return;
          }

          if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'ui-popup ProseMirror-completion-dropdown';
            dropdown.addEventListener('mousedown', e => e.preventDefault());
            document.body.appendChild(dropdown);
          }

          dropdown.innerHTML = '';
          completion.options.forEach((option, index) => {
            const item = document.createElement('div');
            item.className = 'ui-popup-item' + (index === completion.selected ? ' selected' : '');
            item.textContent = option.label;
            item.addEventListener('click', () => applyCompletion(view, { ...completion, selected: index }));
            dropdown!.appendChild(item);
          });

          const coords = view.coordsAtPos(completion.to);
          dropdown.style.left = `${coords.left}px`;
          dropdown.style.top = `${coords.bottom + 2}px`;
          const rect = dropdown.getBoundingClientRect();
          if (rect.bottom > window.innerHeight) dropdown.style.top = `${coords.top - rect.height - 2}px`;
          if (rect.right > window.innerWidth) dropdown.style.left = `${window.innerWidth - rect.width - 8}px`;
        },
        destroy() {
          if (dropdown) {
            dropdown.remove();
            dropdown = null;
          }
        }
      };
    }
  });
}

/** Add an entry to one of the SmartType lists by hand. */
export function addSmartTypeEntry(view: EditorView, list: SmartList, value: string) {
  const data = smartTypeKey.getState(view.state);
  if (!data) return;
  const next = { ...data, [list]: new Set(data[list]) } as SmartTypeData;
  next[list].add(value.toUpperCase());
  view.dispatch(view.state.tr.setMeta(smartTypeKey, next));
}
