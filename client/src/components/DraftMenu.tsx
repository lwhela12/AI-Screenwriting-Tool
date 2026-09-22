import React, { useState } from 'react';
import type { DraftCollection } from '../drafts';
import { ChevronDownIcon } from '../icons';
import { Popover, MenuItem } from './Popover';

interface DraftMenuProps {
  title: string;
  drafts: DraftCollection;
  busy: boolean;
  error: string | null;
  onCreate: () => Promise<boolean>;
  onSelect: (id: string) => Promise<boolean>;
  onRename: (name: string) => Promise<boolean>;
}

/**
 * The script's title in the toolbar doubles as the drafts menu: which draft
 * is open, the others, rename, and a new one. One draft with its default
 * name shows only the title.
 */
export const DraftMenu: React.FC<DraftMenuProps> = ({ title, drafts, busy, error, onCreate, onSelect, onRename }) => {
  const active = drafts.items.find(d => d.id === drafts.activeId)!;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const showDraft = drafts.items.length > 1 || !/^draft 1$/i.test(active.name);
  const close = () => {
    setOpen(false);
    setName(null);
  };

  return (
    <Popover
      open={open}
      onClose={close}
      className="draft-menu"
      trigger={
        <button className="toolbar-title-button" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="menu" aria-expanded={open} title="Drafts">
          <span className="toolbar-title-text">{title}</span>
          {showDraft && <span className="toolbar-draft-name">{active.name}</span>}
          <ChevronDownIcon />
        </button>
      }
    >
      {name === null ? (
        <>
          <div className="ui-menu-title">Drafts</div>
          {drafts.items.map(draft => (
            <MenuItem key={draft.id} checked={draft.id === drafts.activeId} disabled={busy} data-draft-id={draft.id}
              onClick={() => { close(); if (draft.id !== drafts.activeId) void onSelect(draft.id); }}>
              {draft.name}
            </MenuItem>
          ))}
          <div className="ui-menu-sep" />
          <MenuItem disabled={busy} onClick={() => setName(active.name)}>Rename…</MenuItem>
          <MenuItem disabled={busy} hint="A copy of this one, with its board and room" onClick={() => { close(); void onCreate(); }}>New draft</MenuItem>
        </>
      ) : (
        <form className="ui-menu-form" onSubmit={async event => {
          event.preventDefault();
          if (await onRename(name)) close();
        }}>
          <input className="ui-input" aria-label="Draft name" autoFocus onFocus={event => event.target.select()} maxLength={80} value={name} disabled={busy}
            onChange={event => setName(event.target.value)} />
          <button className="ui-button outlined" type="submit" disabled={busy}>Save name</button>
          <button className="ui-button" type="button" disabled={busy} onClick={() => setName(null)}>Cancel</button>
        </form>
      )}
      {error && <div className="ui-menu-error" role="alert">{error}</div>}
    </Popover>
  );
};

export default DraftMenu;
