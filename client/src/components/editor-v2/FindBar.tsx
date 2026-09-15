import React, { useEffect, useRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { searchKey, setSearch, findNext, findPrevious, replaceCurrent, replaceAll, closeSearch } from './plugins/search';

interface FindBarProps {
  view: EditorView | null;
  state: EditorState;
}

/** The find and replace bar under the editor toolbar. Mod-F opens it, Escape closes it. */
export const FindBar: React.FC<FindBarProps> = ({ view, state }) => {
  const search = searchKey.getState(state);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (search?.open && !wasOpen.current) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    wasOpen.current = !!search?.open;
  }, [search?.open]);

  if (!view || !search?.open) return null;

  const run = (command: (s: EditorState, d: (tr: any) => void) => boolean) => {
    command(view.state, view.dispatch);
  };
  const update = (patch: Parameters<typeof setSearch>[2]) => setSearch(view.state, view.dispatch, patch);
  const count = search.matches.length;
  const position = search.current >= 0 ? search.current + 1 : 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run(e.shiftKey ? findPrevious : findNext);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      run(closeSearch);
      view.focus();
    }
  };

  return (
    <div className="find-bar" role="search">
      <input
        ref={inputRef}
        className="find-input"
        placeholder="Find"
        value={search.query}
        onChange={e => update({ query: e.target.value })}
        onKeyDown={onKeyDown}
      />
      <span className="find-count">{search.query ? (count ? `${position} of ${count}` : 'No matches') : ''}</span>
      <button title="Previous (Shift-Enter, ⇧⌘G)" onClick={() => run(findPrevious)} disabled={!count}>
        ↑
      </button>
      <button title="Next (Enter, ⌘G)" onClick={() => run(findNext)} disabled={!count}>
        ↓
      </button>
      <label className="find-option">
        <input type="checkbox" checked={search.options.caseSensitive} onChange={e => update({ options: { ...search.options, caseSensitive: e.target.checked } })} />
        Match case
      </label>
      <label className="find-option">
        <input type="checkbox" checked={search.options.wholeWord} onChange={e => update({ options: { ...search.options, wholeWord: e.target.checked } })} />
        Whole word
      </label>
      <span className="find-sep" />
      <input
        className="find-input"
        placeholder="Replace with"
        value={search.replacement}
        onChange={e => update({ replacement: e.target.value })}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            run(replaceCurrent);
          } else if (e.key === 'Escape') {
            run(closeSearch);
            view.focus();
          }
        }}
      />
      <button onClick={() => run(replaceCurrent)} disabled={search.current < 0}>
        Replace
      </button>
      <button onClick={() => run(replaceAll)} disabled={!count}>
        Replace all
      </button>
      <button
        className="find-close"
        title="Close (Esc)"
        onClick={() => {
          run(closeSearch);
          view.focus();
        }}
      >
        ✕
      </button>
    </div>
  );
};

export default FindBar;
