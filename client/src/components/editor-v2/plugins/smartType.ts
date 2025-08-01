import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { ResolvedPos } from 'prosemirror-model';

export type SmartList = 'characters' | 'locations' | 'times' | 'transitions';

interface SmartTypeData {
  characters: Set<string>;
  locations: Set<string>;
  times: Set<string>;
  transitions: Set<string>;
}

interface CompletionItem {
  label: string;
  type: string;
}

interface CompletionState {
  active: boolean;
  from: number;
  to: number;
  options: CompletionItem[];
  selected: number;
}

const smartTypeKey = new PluginKey<SmartTypeData>('smartType');
const completionKey = new PluginKey<CompletionState>('completion');

// Initial data with common screenplay elements
const initialData: SmartTypeData = {
  characters: new Set<string>(),
  locations: new Set<string>(),
  times: new Set<string>(['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER']),
  transitions: new Set<string>(['FADE IN:', 'FADE OUT.', 'CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE TO BLACK.', 'TIME CUT TO:'])
};

// Create the smart type data plugin
export function smartTypePlugin(): Plugin<SmartTypeData> {
  return new Plugin({
    key: smartTypeKey,
    state: {
      init: () => ({
        characters: new Set(initialData.characters),
        locations: new Set(initialData.locations),
        times: new Set(initialData.times),
        transitions: new Set(initialData.transitions)
      }),
      apply(tr, data) {
        // Extract and store new elements from the document
        const newData = { ...data };
        let changed = false;
        
        tr.doc.forEach((node, offset) => {
          if (node.type.name === 'page') {
            node.forEach((child) => {
              const text = child.textContent.trim();
              
              // Extract characters
              if (child.type.name === 'character' && text.length > 0) {
                const charName = text.replace(/\s*\([^)]+\)\s*$/, '').toUpperCase();
                if (!data.characters.has(charName)) {
                  newData.characters = new Set(data.characters);
                  newData.characters.add(charName);
                  changed = true;
                }
              }
              
              // Extract locations from scene headings
              if (child.type.name === 'scene_heading') {
                const match = /^(INT\.|EXT\.|I\/E\.|E\/I\.)\s+([^-]+)/.exec(text.toUpperCase());
                if (match) {
                  const location = match[2].trim();
                  if (!data.locations.has(location)) {
                    newData.locations = new Set(data.locations);
                    newData.locations.add(location);
                    changed = true;
                  }
                }
              }
              
              // Extract character names from action lines (first introduction)
              if (child.type.name === 'action' && text.length > 0) {
                // Match CAPITALIZED words/phrases (2+ consecutive capital letters)
                // Common patterns: "JOHN enters", "SARAH CONNOR walks", "DR. SMITH arrives"
                const charMatches = text.matchAll(/\b([A-Z][A-Z\.\s]{1,30}[A-Z])\b/g);
                for (const match of charMatches) {
                  const potentialName = match[1].trim();
                  // Filter out common words that aren't names
                  const commonWords = ['THE', 'AND', 'BUT', 'FOR', 'WITH', 'FROM', 'INTO', 'OVER'];
                  if (!commonWords.includes(potentialName) && 
                      potentialName.length >= 2 &&
                      !data.characters.has(potentialName)) {
                    newData.characters = new Set(data.characters);
                    newData.characters.add(potentialName);
                    changed = true;
                  }
                }
              }
            });
          }
        });
        
        return changed ? newData : data;
      }
    }
  });
}

// Get completions based on context
function getCompletions(state: EditorState, pos: number): CompletionState | null {
  const $pos = state.doc.resolve(pos);
  const node = $pos.node();
  
  // Only provide completions within text content
  if (!$pos.parent.isTextblock) return null;
  
  const text = $pos.parent.textContent;
  const textBefore = text.slice(0, $pos.parentOffset);
  const trimmed = textBefore.trim();
  const data = smartTypeKey.getState(state);
  
  if (!data) return null;
  
  const nodeType = $pos.parent.type.name;
  const options: CompletionItem[] = [];
  let from = $pos.pos - textBefore.length;
  
  // Scene heading completions
  if (nodeType === 'scene_heading') {
    // INT./EXT. prefix
    const upperText = textBefore.toUpperCase();
    if (/^(I|E|INT|EXT|I\/E)?$/.test(trimmed.toUpperCase())) {
      return {
        active: true,
        from: $pos.pos - trimmed.length,
        to: $pos.pos,
        options: [
          { label: 'INT.', type: 'keyword' },
          { label: 'EXT.', type: 'keyword' },
          { label: 'I/E.', type: 'keyword' }
        ],
        selected: 0
      };
    }
    
    // Location after INT./EXT.
    const locMatch = /^(INT\.|EXT\.|I\/E\.|E\/I\.)\s+(.*)$/.exec(upperText);
    if (locMatch) {
      const partial = locMatch[2].replace(/\s+-.*$/, '').trim();
      from = $pos.pos - locMatch[2].length;
      
      data.locations.forEach(loc => {
        if (loc.startsWith(partial)) {
          options.push({ label: loc, type: 'location' });
        }
      });
      
      if (options.length > 0) {
        return { active: true, from, to: $pos.pos, options, selected: 0 };
      }
    }
    
    // Time of day after " - "
    const timeMatch = / - ([A-Z]*)$/i.exec(textBefore);
    if (timeMatch) {
      from = $pos.pos - timeMatch[1].length;
      
      data.times.forEach(time => {
        if (time.startsWith(timeMatch[1].toUpperCase())) {
          options.push({ label: time, type: 'time' });
        }
      });
      
      if (options.length > 0) {
        return { active: true, from, to: $pos.pos, options, selected: 0 };
      }
    }
  }
  
  // Character name completions
  if (nodeType === 'character' && text.length > 0) {
    // Replace the entire character element content
    const nodeStart = $pos.before();
    from = nodeStart + 1; // +1 to get inside the node
    const to = nodeStart + 1 + text.length;
    
    const upperText = text.toUpperCase();
    data.characters.forEach(char => {
      if (char.startsWith(upperText)) {
        options.push({ label: char, type: 'character' });
      }
    });
    
    if (options.length > 0) {
      return { active: true, from, to, options, selected: 0 };
    }
  }
  
  // Transition completions
  if (nodeType === 'transition' && trimmed.length > 0) {
    from = $pos.pos - trimmed.length;
    
    data.transitions.forEach(trans => {
      if (trans.toUpperCase().startsWith(trimmed.toUpperCase())) {
        options.push({ label: trans, type: 'transition' });
      }
    });
    
    if (options.length > 0) {
      return { active: true, from, to: $pos.pos, options, selected: 0 };
    }
  }
  
  return null;
}

// Create the completion UI plugin
export function completionPlugin(): Plugin<CompletionState> {
  let completionElement: HTMLElement | null = null;
  
  return new Plugin({
    key: completionKey,
    state: {
      init: () => ({ active: false, from: 0, to: 0, options: [], selected: 0 }),
      apply(tr, state, oldState, newState) {
        // Check for meta updates (arrow key navigation)
        const meta = tr.getMeta(completionKey);
        if (meta) {
          return meta;
        }
        
        // Clear completions on selection change or doc change
        if (tr.selection.from !== tr.selection.to || tr.docChanged) {
          const completions = getCompletions(newState, tr.selection.from);
          return completions || { active: false, from: 0, to: 0, options: [], selected: 0 };
        }
        return state;
      }
    },
    
    props: {
      decorations(state) {
        return DecorationSet.empty; // We'll handle dropdown rendering in the view
      },
      
      handleKeyDown(view, event) {
        const completion = completionKey.getState(view.state);
        
        // Only handle keys if dropdown is actually showing
        if (!completion || !completion.active || completion.options.length === 0) {
          return false;
        }
        
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            const nextSelected = (completion.selected + 1) % completion.options.length;
            // Update state and force re-render
            const downTr = view.state.tr.setMeta(completionKey, {
              ...completion,
              selected: nextSelected
            });
            view.dispatch(downTr);
            return true;
            
          case 'ArrowUp':
            event.preventDefault();
            const prevSelected = (completion.selected - 1 + completion.options.length) % completion.options.length;
            // Update state and force re-render
            const upTr = view.state.tr.setMeta(completionKey, {
              ...completion,
              selected: prevSelected
            });
            view.dispatch(upTr);
            return true;
            
          case 'Enter':
          case 'Tab':
            event.preventDefault();
            applyCompletion(view, completion);
            return true;
            
          case 'Escape':
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, {
              active: false, from: 0, to: 0, options: [], selected: 0
            }));
            return true;
        }
        
        return false;
      },
      
      handleClick(view, pos, event) {
        const completion = completionKey.getState(view.state);
        if (!completion || !completion.active) return false;
        
        const target = event.target as HTMLElement;
        if (target.classList.contains('ProseMirror-completion-item')) {
          const index = parseInt(target.getAttribute('data-index') || '0');
          applyCompletion(view, { ...completion, selected: index });
          return true;
        }
        
        // Click outside closes completions
        view.dispatch(view.state.tr.setMeta(completionKey, {
          active: false, from: 0, to: 0, options: [], selected: 0
        }));
        return false;
      },
      
      handleTextInput(view, from, to, text) {
        // Let text input proceed normally - completions will update in view.update
        return false;
      }
    },
    
    view(editorView) {
      return {
        update(view, prevState) {
          const state = view.state;
          const completion = completionKey.getState(state);
          const prevCompletion = completionKey.getState(prevState);
          
          // Check if we should update completions
          const shouldUpdate = state.selection.from === state.selection.to && 
                              (state.doc !== prevState.doc || 
                               state.selection.from !== prevState.selection.from);
          
          if (shouldUpdate) {
            // Always check for new completions on any change
            const newCompletion = getCompletions(state, state.selection.from);
            
            if (newCompletion && newCompletion.options.length > 0) {
              // Show completions
              if (!completion || !completion.active || 
                  newCompletion.from !== completion.from ||
                  newCompletion.options.length !== completion.options.length) {
                view.dispatch(state.tr.setMeta(completionKey, newCompletion));
              }
            } else if (completion && completion.active) {
              // Hide completions
              view.dispatch(state.tr.setMeta(completionKey, {
                active: false, from: 0, to: 0, options: [], selected: 0
              }));
            }
          }
          
          // Update dropdown UI - always update if active to handle selection changes
          if (completion && completion.active) {
            if (!completionElement) {
              completionElement = document.createElement('div');
              completionElement.className = 'ProseMirror-completion-dropdown';
              document.body.appendChild(completionElement);
            }
            
            // Update dropdown content
            completionElement.innerHTML = '';
            completion.options.forEach((option, index) => {
              const item = document.createElement('div');
              item.className = 'ProseMirror-completion-item';
              if (index === completion.selected) {
                item.classList.add('ProseMirror-completion-selected');
              }
              item.textContent = option.label;
              item.setAttribute('data-index', String(index));
              item.onclick = () => {
                applyCompletion(view, { ...completion, selected: index });
              };
              completionElement.appendChild(item);
            });
            
            // Position dropdown
            const coords = view.coordsAtPos(completion.to);
            completionElement.style.position = 'fixed';
            completionElement.style.left = coords.left + 'px';
            completionElement.style.top = coords.bottom + 'px';
            
            // Ensure dropdown is visible
            const rect = completionElement.getBoundingClientRect();
            if (rect.bottom > window.innerHeight) {
              completionElement.style.top = (coords.top - rect.height) + 'px';
            }
            if (rect.right > window.innerWidth) {
              completionElement.style.left = (window.innerWidth - rect.width - 10) + 'px';
            }
          } else if (completionElement) {
            completionElement.remove();
            completionElement = null;
          }
        },
        
        destroy() {
          if (completionElement) {
            completionElement.remove();
            completionElement = null;
          }
        }
      };
    }
  });
}

// Apply the selected completion
function applyCompletion(view: EditorView, completion: CompletionState) {
  const option = completion.options[completion.selected];
  if (!option) return;
  
  const tr = view.state.tr;
  tr.replaceWith(completion.from, completion.to, view.state.schema.text(option.label));
  
  // Add space after certain completions
  if (option.type === 'keyword' || option.type === 'location') {
    tr.insertText(' ');
  }
  
  // Clear completion state
  tr.setMeta(completionKey, {
    active: false, from: 0, to: 0, options: [], selected: 0
  });
  
  view.dispatch(tr);
  view.focus();
}

// Export function to add an entry manually
export function addSmartTypeEntry(view: EditorView, list: SmartList, value: string) {
  const data = smartTypeKey.getState(view.state);
  if (!data) return;
  
  const newData = { ...data };
  newData[list] = new Set(data[list]);
  newData[list].add(value.toUpperCase());
  
  view.dispatch(view.state.tr.setMeta(smartTypeKey, newData));
}