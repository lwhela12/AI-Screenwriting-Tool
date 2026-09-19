import React, { useRef, useState } from 'react';
import type { DraftCollection } from '../drafts';
import { PlusIcon } from '../icons';
import './DraftControls.css';

interface DraftControlsProps {
  drafts: DraftCollection;
  busy: boolean;
  error: string | null;
  onCreate: () => Promise<boolean>;
  onSelect: (id: string) => Promise<boolean>;
  onRename: (name: string) => Promise<boolean>;
}

/** Always-visible draft identity, with creation and keyboard-accessible inline renaming. */
export const DraftControls: React.FC<DraftControlsProps> = ({ drafts, busy, error, onCreate, onSelect, onRename }) => {
  const active = drafts.items.find(d => d.id === drafts.activeId)!;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(active.name);
  const renameButton = useRef<HTMLButtonElement>(null);
  const finishRename = () => {
    setRenaming(false);
    renameButton.current?.focus();
  };

  return (
    <div className="draft-toolbar" aria-label="Drafts">
      <label className="draft-label" htmlFor="active-draft">Draft</label>
      <select id="active-draft" className="draft-select" value={drafts.activeId} disabled={busy || renaming}
        onChange={event => void onSelect(event.target.value)}>
        {drafts.items.map(draft => <option key={draft.id} value={draft.id}>{draft.name}</option>)}
      </select>
      <button ref={renameButton} className="ui-button" disabled={busy || renaming}
        onClick={() => { setName(active.name); setRenaming(true); }}>Rename</button>
      {renaming ? (
        <form className="draft-rename" onSubmit={async event => {
          event.preventDefault();
          if (await onRename(name)) finishRename();
        }}>
          <input className="ui-input" aria-label="Draft name" aria-describedby={error ? 'draft-error' : undefined}
            autoFocus onFocus={event => event.target.select()} maxLength={80} value={name} disabled={busy}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); finishRename(); } }} />
          <button className="ui-button outlined" type="submit" disabled={busy}>Save name</button>
          <button className="ui-button" type="button" disabled={busy} onClick={finishRename}>Cancel</button>
        </form>
      ) : (
        <button className="ui-button outlined" disabled={busy} onClick={() => void onCreate()}>
          <PlusIcon /><span>Create New Draft</span>
        </button>
      )}
      {error && <span className="draft-error" id="draft-error" role="alert">{error}</span>}
      <span className="draft-count">{drafts.items.length} {drafts.items.length === 1 ? 'draft' : 'drafts'}</span>
    </div>
  );
};
