/** Editable drafts live together in a workspace. Top-level fields are the active draft. */
export interface DraftContent {
  title: string;
  author?: string;
  contact?: string;
  content: string;
  beats?: unknown;
  room?: unknown;
  outline?: unknown;
}

export interface ScriptDraft extends DraftContent {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftCollection {
  version: 1;
  activeId: string;
  items: ScriptDraft[];
}

export interface DraftDocument extends DraftContent {
  drafts?: DraftCollection;
}

function newId(): string {
  return `draft-${crypto.randomUUID()}`;
}

/** Copy only draft-owned data, never workspace IDs or other drafts. */
function contentOf(doc: DraftContent): DraftContent {
  return { title: doc.title, author: doc.author || '', contact: doc.contact || '', content: doc.content,
    beats: doc.beats ?? null, room: doc.room ?? null, outline: doc.outline ?? null };
}

function copyContent(doc: DraftContent): DraftContent {
  return JSON.parse(JSON.stringify(contentOf(doc))) as DraftContent;
}

/** Reject incomplete draft archives instead of silently dropping a writer's work. */
export function readDrafts(raw: unknown): DraftCollection {
  const collection = raw as Partial<DraftCollection> | null;
  if (!collection || collection.version !== 1 || !Array.isArray(collection.items) || !collection.items.length) {
    throw new Error('This workspace has an invalid draft collection. The original file has not been changed.');
  }
  const ids = new Set<string>();
  for (const draft of collection.items) {
    if (!draft || typeof draft.id !== 'string' || !draft.id || ids.has(draft.id) ||
        typeof draft.name !== 'string' || !draft.name.trim() || typeof draft.title !== 'string' ||
        typeof draft.content !== 'string' || typeof draft.createdAt !== 'string' || typeof draft.updatedAt !== 'string') {
      throw new Error('This workspace contains an invalid draft. The original file has not been changed.');
    }
    ids.add(draft.id);
  }
  if (typeof collection.activeId !== 'string' || !ids.has(collection.activeId)) {
    throw new Error('The selected draft is missing from this workspace. The original file has not been changed.');
  }
  return collection as DraftCollection;
}

/** Older single-script workspaces become Draft 1 in memory, without rewriting the file. */
export function initializeDrafts<T extends DraftDocument>(doc: T): T & { drafts: DraftCollection } {
  if (doc.drafts) {
    const drafts = readDrafts(doc.drafts);
    const active = drafts.items.find(d => d.id === drafts.activeId)!;
    return { ...doc, ...contentOf(active), drafts };
  }
  const now = new Date().toISOString();
  const draft: ScriptDraft = { ...copyContent(doc), id: newId(), name: 'Draft 1', createdAt: now, updatedAt: now };
  return { ...doc, drafts: { version: 1, activeId: draft.id, items: [draft] } };
}

/** Capture the latest editor and planning state before any save or draft operation. */
export function captureDraft<T extends DraftDocument>(doc: T): T & { drafts: DraftCollection } {
  if (!doc.drafts) return initializeDrafts(doc);
  const drafts = doc.drafts;
  const current = contentOf(doc);
  const items = drafts.items.map(d => {
    if (d.id !== drafts.activeId) return d;
    const unchanged = d.title === current.title && d.author === current.author && d.contact === current.contact &&
      d.content === current.content && d.beats === current.beats && d.room === current.room && d.outline === current.outline;
    return { ...d, ...current, updatedAt: unchanged ? d.updatedAt : new Date().toISOString() };
  });
  return { ...doc, drafts: { ...drafts, items } };
}

/** Duplicate the selected draft, including its planning material, and activate the copy. */
export function createDraft<T extends DraftDocument>(doc: T): T & { drafts: DraftCollection } {
  const saved = captureDraft(doc);
  const names = new Set(saved.drafts.items.map(d => d.name.toLowerCase()));
  let number = saved.drafts.items.length + 1;
  while (names.has(`draft ${number}`)) number++;
  const now = new Date().toISOString();
  const draft: ScriptDraft = { ...copyContent(saved), id: newId(), name: `Draft ${number}`, createdAt: now, updatedAt: now };
  return { ...saved, ...contentOf(draft), drafts: { ...saved.drafts, activeId: draft.id, items: [...saved.drafts.items, draft] } };
}

/** Save the outgoing draft before selecting another; neither draft is overwritten. */
export function switchDraft<T extends DraftDocument>(doc: T, id: string): T & { drafts: DraftCollection } {
  const saved = captureDraft(doc);
  const selected = saved.drafts.items.find(d => d.id === id);
  if (!selected) throw new Error('That draft could not be found.');
  return { ...saved, ...copyContent(selected), drafts: { ...saved.drafts, activeId: id } };
}

/** Rename the active draft while keeping its ID and content stable. */
export function renameDraft<T extends DraftDocument>(doc: T, name: string): T & { drafts: DraftCollection } {
  const saved = captureDraft(doc);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a draft name.');
  if (trimmed.length > 80) throw new Error('Use a name of 80 characters or fewer.');
  if (saved.drafts.items.some(d => d.id !== saved.drafts.activeId && d.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Another draft already has that name.');
  }
  return { ...saved, drafts: { ...saved.drafts, items: saved.drafts.items.map(d => d.id === saved.drafts.activeId ? { ...d, name: trimmed } : d) } };
}

export function activeDraftName(doc: Pick<DraftDocument, 'drafts'>): string | undefined {
  return doc.drafts?.items.find(d => d.id === doc.drafts?.activeId)?.name;
}
