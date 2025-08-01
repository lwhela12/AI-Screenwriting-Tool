import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { screenplaySchema } from '../schema/screenplaySchema';
import { TextSelection } from 'prosemirror-state';

const doubleEnterKey = new PluginKey('doubleEnter');

interface DoubleEnterState {
  lastEnterTime: number;
  lastEnterPos: number;
}

export function doubleEnterPlugin(): Plugin<DoubleEnterState> {
  let menuElement: HTMLElement | null = null;
  let lastEnterTime = 0;
  let lastEnterPos = -1;
  
  return new Plugin({
    key: doubleEnterKey,
    
    state: {
      init: () => ({ lastEnterTime: 0, lastEnterPos: -1 }),
      apply(tr, state) {
        return state; // State is managed locally
      }
    },
    
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Enter') return false;
        
        const now = Date.now();
        const pos = view.state.selection.from;
        
        // Check if this is a double Enter (within 500ms at same position)
        if (now - lastEnterTime < 500 && 
            lastEnterPos === pos &&
            view.state.selection.empty) {
          
          event.preventDefault();
          
          // Show element menu
          showElementMenu(view, pos);
          
          // Reset state
          lastEnterTime = 0;
          lastEnterPos = -1;
          
          return true;
        }
        
        // Update state for next Enter
        lastEnterTime = now;
        lastEnterPos = pos;
        
        return false;
      }
    },
    
    view(editorView) {
      return {
        destroy() {
          if (menuElement) {
            menuElement.remove();
            menuElement = null;
          }
        }
      };
    }
  });
  
  function showElementMenu(view: EditorView, pos: number) {
    // Remove existing menu if any
    if (menuElement) {
      menuElement.remove();
    }
    
    // Create menu element
    menuElement = document.createElement('div');
    menuElement.className = 'ProseMirror-element-menu';
    menuElement.style.position = 'fixed';
    
    // Element types to show
    const elements = [
      { type: 'scene_heading', label: 'Scene Heading', shortcut: '⌘1' },
      { type: 'action', label: 'Action', shortcut: '⌘2' },
      { type: 'character', label: 'Character', shortcut: '⌘3' },
      { type: 'dialogue', label: 'Dialogue', shortcut: '⌘4' },
      { type: 'parenthetical', label: 'Parenthetical', shortcut: '⌘5' },
      { type: 'transition', label: 'Transition', shortcut: '⌘6' },
      { type: 'centered', label: 'Centered', shortcut: '⌘7' }
    ];
    
    elements.forEach((elem, index) => {
      const item = document.createElement('div');
      item.className = 'ProseMirror-element-menu-item';
      item.innerHTML = `
        <span class="element-label">${elem.label}</span>
        <span class="element-shortcut">${elem.shortcut}</span>
      `;
      
      item.onclick = () => {
        changeElementType(view, elem.type);
        menuElement?.remove();
        menuElement = null;
      };
      
      menuElement.appendChild(item);
    });
    
    // Position menu at cursor
    const coords = view.coordsAtPos(pos);
    menuElement.style.left = coords.left + 'px';
    menuElement.style.top = coords.bottom + 5 + 'px';
    
    // Add to body
    document.body.appendChild(menuElement);
    
    // Remove menu on click outside or escape
    const removeMenu = () => {
      if (menuElement) {
        menuElement.remove();
        menuElement = null;
      }
      document.removeEventListener('click', removeMenu);
      document.removeEventListener('keydown', handleEscape);
    };
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        removeMenu();
      }
    };
    
    // Delay to avoid immediate removal
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
      document.addEventListener('keydown', handleEscape);
    }, 100);
  }
  
  function changeElementType(view: EditorView, typeName: string) {
    const { $from } = view.state.selection;
    const nodeType = screenplaySchema.nodes[typeName];
    
    if (!nodeType) return;
    
    const tr = view.state.tr;
    const nodeStart = $from.before();
    
    tr.setNodeMarkup(nodeStart, nodeType);
    view.dispatch(tr);
    view.focus();
  }
}