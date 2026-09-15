import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ELEMENT_ORDER, ELEMENT_LABELS, isElementType } from '../schema/screenplaySchema';
import { elementMenuKey, ElementMenuState, setElementType, autoFormatKey } from './commands';

const CLOSED: ElementMenuState = { open: false, selected: 0 };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

/**
 * The element pop-up menu. Opened by pressing Enter on an empty element
 * (Final Draft's "double Enter"), it lets the writer pick the element type
 * with the arrow keys, a digit, or the mouse. Any edit or cursor move closes it.
 */
export function elementMenuPlugin(): Plugin<ElementMenuState> {
  let menuEl: HTMLElement | null = null;

  function close(view: EditorView) {
    if (elementMenuKey.getState(view.state)?.open) {
      view.dispatch(view.state.tr.setMeta(elementMenuKey, CLOSED));
    }
  }

  function choose(view: EditorView, index: number) {
    const type = ELEMENT_ORDER[index];
    const { $from } = view.state.selection;
    if (!type || !isElementType($from.parent.type.name)) return;
    const tr = view.state.tr;
    setElementType(tr, $from.before(), type);
    tr.setMeta(elementMenuKey, CLOSED).setMeta(autoFormatKey, 'converted');
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }

  function render(view: EditorView, state: ElementMenuState) {
    if (!state.open) {
      if (menuEl) {
        menuEl.remove();
        menuEl = null;
      }
      return;
    }

    if (!menuEl) {
      menuEl = document.createElement('div');
      menuEl.className = 'ProseMirror-element-menu';
      menuEl.setAttribute('role', 'listbox');
      // Keep focus in the editor when the menu is clicked.
      menuEl.addEventListener('mousedown', e => e.preventDefault());
      document.body.appendChild(menuEl);
    }

    menuEl.innerHTML = '';
    ELEMENT_ORDER.forEach((type, index) => {
      const item = document.createElement('div');
      item.className = 'ProseMirror-element-menu-item' + (index === state.selected ? ' selected' : '');
      item.setAttribute('role', 'option');
      const label = document.createElement('span');
      label.className = 'element-label';
      label.textContent = ELEMENT_LABELS[type];
      const shortcut = document.createElement('span');
      shortcut.className = 'element-shortcut';
      shortcut.textContent = `${MOD}${index + 1}`;
      item.append(label, shortcut);
      item.addEventListener('click', () => choose(view, index));
      menuEl!.appendChild(item);
    });

    const coords = view.coordsAtPos(view.state.selection.from);
    menuEl.style.left = `${coords.left}px`;
    menuEl.style.top = `${coords.bottom + 4}px`;
    const rect = menuEl.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) menuEl.style.top = `${coords.top - rect.height - 4}px`;
    if (rect.right > window.innerWidth) menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
  }

  return new Plugin<ElementMenuState>({
    key: elementMenuKey,

    state: {
      init: () => CLOSED,
      apply(tr, state) {
        const meta = tr.getMeta(elementMenuKey) as ElementMenuState | undefined;
        if (meta) return meta;
        if (state.open && (tr.docChanged || tr.selectionSet)) return CLOSED;
        return state;
      }
    },

    props: {
      handleKeyDown(view, event) {
        const state = elementMenuKey.getState(view.state);
        if (!state?.open) return false;

        const count = ELEMENT_ORDER.length;
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(elementMenuKey, { open: true, selected: (state.selected + 1) % count }));
            return true;
          case 'ArrowUp':
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(elementMenuKey, { open: true, selected: (state.selected - 1 + count) % count }));
            return true;
          case 'Enter':
            event.preventDefault();
            choose(view, state.selected);
            return true;
          case 'Escape':
            event.preventDefault();
            close(view);
            return true;
        }

        if (/^[1-7]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          choose(view, Number(event.key) - 1);
          return true;
        }

        // Any other key closes the menu and is handled normally.
        close(view);
        return false;
      },

      handleDOMEvents: {
        blur(view) {
          close(view);
          return false;
        }
      }
    },

    view(view) {
      const onDocClick = (e: MouseEvent) => {
        if (menuEl && !menuEl.contains(e.target as Node)) close(view);
      };
      document.addEventListener('mousedown', onDocClick);
      return {
        update(v) {
          render(v, elementMenuKey.getState(v.state) || CLOSED);
        },
        destroy() {
          document.removeEventListener('mousedown', onDocClick);
          if (menuEl) {
            menuEl.remove();
            menuEl = null;
          }
        }
      };
    }
  });
}
