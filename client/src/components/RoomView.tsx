import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { scenesOf, sceneAt, insertScene, SceneInfo } from './editor-v2/scenes';
import { BeatBoardData, Beat, BEAT_COLORS, CARD_GAP, boardExtent, newBeatId, normalizeBeats } from './beats';
import { BeatBoard } from './BeatBoard';
import { BoardIcon } from '../icons';
import { pageViewKey } from './editor-v2/plugins/pageView';
import { RoomData, RoomMode, RoomFormat, RoomMessage, Proposal, Treatment, Conversation, ROOM_MODES, FORMATS, DEFAULT_FORMAT, BEATS_REQUEST, SCENES_REQUEST, applyBeatSheet, activeConversation, newConversation, withConversation, patchConversation, conversationLabel, SUMMARY_INSTRUCTIONS, summaryPrompt, parseSummary, STARTERS, PLOT_STARTERS, PLOT_REQUEST, TREATMENT_FILE_TYPES, normalizeRoom, newRoomId, roomContext, roomInstructions, roomTurns, parseReply, proposalSynopsis, treatmentFromFile, wordCount } from './room';
import { requestAI, openHostSettings } from '../host';
import { useCloudAvailability, useAIAvailability } from '../ai';
import { SparkleIcon, PlusIcon, SidebarIcon } from '../icons';
import './Room.css';

interface RoomViewProps {
  view: EditorView | null;
  state: EditorState;
  title: string;
  data: unknown;
  onChange: (data: RoomData) => void;
  beats: unknown;
  onBeatsChange: (data: BeatBoardData) => void;
  onOpenScene: (scene: SceneInfo) => void;
}

/** Plain prose with paragraph breaks; the room writes no markup. */
const Prose: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text
      .split(/\n{2,}/)
      .filter(p => p.trim())
      .map((p, i) => (
        <p key={i}>{p.trim()}</p>
      ))}
  </>
);

const HISTORY_KEY = 'ui.roomHistory';
const BOARD_WIDTH_KEY = 'ui.roomBoardWidth';
const BOARD_MIN_WIDTH = 320;
const CHAT_MIN_WIDTH = 420;

export const RoomView: React.FC<RoomViewProps> = ({ view, state, title, data, onChange, beats, onBeatsChange, onOpenScene }) => {
  const room = useMemo(() => normalizeRoom(data), [data]);
  const board = useMemo(() => normalizeBeats(beats), [beats]);
  const cloud = useCloudAvailability();
  const device = useAIAvailability();
  // Background work (summaries) lands on whatever the room is by then, not on a stale copy.
  const roomRef = useRef(room);
  roomRef.current = room;
  const conversation = activeConversation(room);
  const messages = conversation?.messages ?? [];
  const proposals = conversation?.proposals ?? [];
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // The right-hand pane: the live board (beats) or the scene proposals and treatment.
  const [pane, setPane] = useState<'board' | 'proposals'>('proposals');
  const [freshBeats, setFreshBeats] = useState<string[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;
  // The board's width beside the chat: dragged on the splitter, remembered between sessions.
  const roomRef2 = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState<number | null>(() => {
    try {
      const stored = Number(localStorage.getItem(BOARD_WIDTH_KEY));
      return Number.isFinite(stored) && stored >= BOARD_MIN_WIDTH ? stored : null;
    } catch {
      return null;
    }
  });
  const [splitting, setSplitting] = useState(false);
  // The conversations column folds to a strip; remembered between sessions.
  const [historyOpen, setHistoryOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HISTORY_KEY) !== 'closed';
    } catch {
      return true;
    }
  });
  const toggleHistory = () => {
    setHistoryOpen(open => {
      try {
        localStorage.setItem(HISTORY_KEY, open ? 'closed' : 'open');
      } catch {
        // Fine; it just will not be remembered.
      }
      return !open;
    });
  };

  const clampBoardWidth = (width: number) => {
    const total = roomRef2.current?.getBoundingClientRect().width ?? 1200;
    return Math.round(Math.max(BOARD_MIN_WIDTH, Math.min(width, total - CHAT_MIN_WIDTH)));
  };

  const startSplit = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setSplitting(true);
    const move = (ev: PointerEvent) => {
      const right = roomRef2.current?.getBoundingClientRect().right ?? window.innerWidth;
      setBoardWidth(clampBoardWidth(right - ev.clientX));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setSplitting(false);
      setBoardWidth(w => {
        try {
          if (w) localStorage.setItem(BOARD_WIDTH_KEY, String(w));
        } catch {
          // Nothing to remember it with; the width still holds for this session.
        }
        return w;
      });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const resetSplit = () => {
    setBoardWidth(null);
    try {
      localStorage.removeItem(BOARD_WIDTH_KEY);
    } catch {
      // Ignore.
    }
  };
  const [mode, setMode] = useState<RoomMode>('break');
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [treatmentDraft, setTreatmentDraft] = useState<string | null>(null);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scenes = useMemo(() => scenesOf(state.doc), [state]);
  const current = sceneAt(scenes, state.selection.from);
  const treatment = room.treatment ?? null;
  const format: RoomFormat = room.format ?? DEFAULT_FORMAT;
  const layout = pageViewKey.getState(state)?.layout;
  // Plotting needs a treatment; fall back when it goes away.
  const activeMode: RoomMode = mode === 'plot' && !treatment ? 'break' : mode;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation?.id, messages.length, streaming]);

  useEffect(() => {
    if (streaming !== null && /```\s*beats/i.test(streaming)) setPane('board');
  }, [streaming]);

  // The composer is one line tall and grows with the draft, up to its CSS max-height.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft]);

  /**
   * Name and summarise a conversation in the background, on this Mac when
   * Apple Intelligence is on (nothing leaves the machine), else with the
   * cloud model. A failure just leaves the fallback label in place.
   */
  const summarize = async (c: Conversation) => {
    const tier = device.available ? 'device' : cloud.available ? 'cloud' : null;
    if (!tier) return;
    try {
      const answer = await requestAI(SUMMARY_INSTRUCTIONS, summaryPrompt(c), { tier });
      const { title: t, summary } = parseSummary(answer);
      if (!t && !summary) return;
      const latest = roomRef.current;
      if (!latest.conversations.some(x => x.id === c.id)) return;
      onChange(patchConversation(latest, c.id, { ...(t ? { title: t } : {}), ...(summary ? { summary } : {}) }));
    } catch {
      // The label falls back to the first message.
    }
  };

  const send = async (text: string, as: RoomMode = activeMode) => {
    const message = text.trim();
    if (!message || streaming !== null || !cloud.available) return;
    const mode = as;
    const now = new Date().toISOString();
    const base = conversation ?? newConversation();
    const writerMessage: RoomMessage = { id: newRoomId('msg'), role: 'writer', text: message, at: now, mode };
    const withWriter: Conversation = { ...base, updatedAt: now, messages: [...base.messages, writerMessage] };
    onChange(withConversation(room, withWriter));
    setDraft('');
    setError(null);
    setStreaming('');
    try {
      const instructions = roomInstructions(mode, roomContext(state.doc, board, title, treatment, layout), format);
      const full = await requestAI(instructions, '', {
        tier: 'cloud',
        messages: roomTurns(base.messages, message),
        onChunk: (_delta, soFar) => setStreaming(soFar)
      });
      const reply: RoomMessage = { id: newRoomId('msg'), role: 'room', text: full, at: new Date().toISOString(), mode };
      const parsed = parseReply(full, mode === 'beats' ? 'beats' : 'proposals');
      const fresh: Proposal[] = parsed.proposals.map(p => ({ id: newRoomId('prop'), ...p, status: 'open', messageId: reply.id }));
      const done: Conversation = { ...withWriter, updatedAt: reply.at, messages: [...withWriter.messages, reply], proposals: [...withWriter.proposals, ...fresh] };
      onChange(withConversation(roomRef.current, done));
      if (parsed.beats.length) {
        // The room edits the board the writer is looking at: cards land, light up, and the pane opens.
        const applied = applyBeatSheet(boardRef.current, parsed.beats);
        onBeatsChange(applied.board);
        setFreshBeats(applied.changedIds);
        setPane('board');
        window.setTimeout(() => setFreshBeats([]), 6000);
      } else if (fresh.length) {
        setPane('proposals');
      }
      void summarize(done);
    } catch (err) {
      const text = (err as Error).message;
      if (text !== 'Cancelled.') setError(text);
    } finally {
      setStreaming(null);
      composerRef.current?.focus();
    }
  };

  /** Show another conversation; a conversation with nothing in it is dropped on the way out. */
  const showConversation = (id: string) => {
    if (streaming !== null) return;
    const conversations = room.conversations.filter(c => c.id === id || c.messages.length || c.proposals.length);
    onChange({ ...room, conversations, activeId: id });
    setConfirmDelete(null);
    setError(null);
  };

  const startConversation = () => {
    if (streaming !== null) return;
    if (conversation && conversation.messages.length === 0) {
      composerRef.current?.focus();
      return;
    }
    onChange(withConversation(room, newConversation()));
    setConfirmDelete(null);
    setError(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const deleteConversation = (id: string) => {
    const conversations = room.conversations.filter(c => c.id !== id);
    const { activeId: _old, ...rest } = room;
    onChange({ ...rest, conversations, ...(conversations[0] ? { activeId: room.activeId === id ? conversations[0].id : room.activeId } : {}) });
    setConfirmDelete(null);
  };

  const setTreatment = (next: Treatment | null) => {
    const { treatment: _old, ...rest } = room;
    onChange(next ? { ...rest, treatment: next } : rest);
    setTreatmentDraft(null);
    setTreatmentOpen(false);
  };

  const saveTreatmentDraft = () => {
    const text = (treatmentDraft ?? '').trim();
    if (!text) return;
    setTreatment({ name: treatment && treatment.name !== 'Pasted' ? treatment.name : 'Pasted', text, at: new Date().toISOString() });
  };

  const importTreatment = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setTreatment(await treatmentFromFile(file));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const plotIt = () => {
    setMode('plot');
    void send(PLOT_REQUEST, 'plot');
  };

  const layOutBeats = () => {
    setPane('board');
    void send(BEATS_REQUEST, 'beats');
  };

  const breakIntoScenes = () => void send(SCENES_REQUEST, 'scenes');

  const dismissOpen = () => {
    if (!conversation) return;
    onChange(patchConversation(room, conversation.id, { proposals: proposals.map(p => (p.status === 'open' ? { ...p, status: 'dismissed' } : p)) }));
  };

  const patchProposal = (id: string, changes: Partial<Proposal>) => {
    if (!conversation) return;
    onChange(patchConversation(room, conversation.id, { proposals: proposals.map(p => (p.id === id ? { ...p, ...changes } : p)) }));
  };

  const toBoard = (p: Proposal) => {
    const { height } = boardExtent(board);
    const beat: Beat = { id: newBeatId(), title: p.title, text: p.text, color: BEAT_COLORS[0], x: CARD_GAP, y: board.beats.length ? height + CARD_GAP : CARD_GAP };
    onBeatsChange({ version: 2, beats: [...board.beats, beat] });
    patchProposal(p.id, { status: 'kept' });
  };

  /** A proposal becomes a scene at the end of the script (or after the current scene). */
  const toScene = (p: Proposal, afterCurrent: boolean): number | null => {
    if (!view) return null;
    const after = afterCurrent && current && !current.opening ? current.ordinal : null;
    insertScene(view, after, p.heading || '', proposalSynopsis(p));
    const created = scenesOf(view.state.doc);
    const ordinal = after === null ? created.length - 1 : after + 1;
    return ordinal;
  };

  const addScene = (p: Proposal, afterCurrent = false) => {
    const ordinal = toScene(p, afterCurrent);
    if (ordinal !== null) patchProposal(p.id, { status: 'kept', sceneOrdinal: ordinal });
  };

  const sendAllToOutline = () => {
    if (!view || !conversation) return;
    let next = proposals;
    for (const p of proposals.filter(p => p.status === 'open')) {
      const ordinal = toScene(p, false);
      if (ordinal !== null) next = next.map(q => (q.id === p.id ? { ...q, status: 'kept', sceneOrdinal: ordinal } : q));
    }
    onChange(patchConversation(room, conversation.id, { proposals: next }));
  };

  const writeIt = (p: Proposal) => {
    if (!view || p.sceneOrdinal === undefined) return;
    const scene = scenesOf(view.state.doc)[p.sceneOrdinal];
    if (scene) onOpenScene(scene);
  };

  const open = proposals.filter(p => p.status === 'open');
  const kept = proposals.filter(p => p.status === 'kept');
  const live = streaming !== null ? parseReply(streaming, activeMode === 'beats' ? 'beats' : 'proposals') : null;
  const dateLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className={`room${splitting ? ' splitting' : ''}`} ref={roomRef2}>
      <aside className={`room-history${historyOpen ? '' : ' collapsed'}`} aria-label="Conversations">
        {!historyOpen && (
          <div className="room-history-strip">
            <button className="ui-button icon" onClick={toggleHistory} title={`Show conversations${room.conversations.length ? ` (${room.conversations.length})` : ''}`}>
              <SidebarIcon />
            </button>
            <button className="ui-button icon" onClick={startConversation} disabled={streaming !== null} title="New conversation">
              <PlusIcon />
            </button>
            {room.conversations.length > 0 && <span className="room-history-count">{room.conversations.length}</span>}
          </div>
        )}
        {historyOpen && (
          <div className="room-proposals-head">
            <span className="ui-label">Conversations</span>
            <span className="room-proposals-actions">
              <button className="ui-button mini" onClick={startConversation} disabled={streaming !== null} title="Start a new conversation; the others stay here">
                <PlusIcon />
                <span>New</span>
              </button>
              <button className="ui-button mini" onClick={toggleHistory} title="Hide conversations">
                <SidebarIcon />
              </button>
            </span>
          </div>
        )}
        {historyOpen && room.conversations.length === 0 && <p className="room-proposals-empty">Each conversation with the room is kept here with a short summary, so you can pick one up again.</p>}
        {historyOpen && room.conversations.map(c => {
          const isActive = c.id === conversation?.id;
          const kept = c.proposals.filter(p => p.status === 'kept').length;
          return (
            <div key={c.id} className={`conversation-row${isActive ? ' active' : ''}`} onClick={() => showConversation(c.id)} role="button" tabIndex={0}>
              <div className="conversation-title">{conversationLabel(c)}</div>
              <div className="conversation-meta">
                {dateLabel(c.updatedAt || c.createdAt)}
                {c.messages.length > 0 && ` · ${Math.ceil(c.messages.length / 2)} ${c.messages.length > 2 ? 'exchanges' : 'exchange'}`}
                {kept > 0 && ` · ${kept} kept`}
              </div>
              {c.summary && <div className="conversation-summary">{c.summary}</div>}
              {isActive && c.messages.length > 0 && (
                <div className="conversation-actions" onClick={e => e.stopPropagation()}>
                  {confirmDelete === c.id ? (
                    <>
                      <button className="ui-button mini danger" onClick={() => deleteConversation(c.id)}>
                        Delete conversation
                      </button>
                      <button className="ui-button mini" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button className="ui-button mini dismiss" onClick={() => setConfirmDelete(c.id)} title="Remove this conversation. Scenes and beats you kept stay in the script and on the board.">
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </aside>
      <div className="room-conversation">
        <div className="room-modes" role="tablist" aria-label="Mode">
          {ROOM_MODES.filter(m => !m.step && (!m.needsTreatment || treatment)).map(m => (
            <button key={m.id} className={`ui-button${activeMode === m.id ? ' active' : ''}`} onClick={() => setMode(m.id)} title={m.hint}>
              {m.label}
            </button>
          ))}
          <span className="room-modes-spacer" />
          <div className="room-pane-toggle" role="tablist" aria-label="Right pane">
            <button className={`ui-button${pane === 'board' ? ' active' : ''}`} onClick={() => setPane('board')} title="The beat board, live: the room writes to it and you can move things while you talk">
              <BoardIcon />
              <span>Board{board.beats.length ? ` ${board.beats.length}` : ''}</span>
            </button>
            <button className={`ui-button${pane === 'proposals' ? ' active' : ''}`} onClick={() => setPane('proposals')} title="Scene proposals and the treatment">
              <span>Proposals{open.length ? ` ${open.length}` : ''}</span>
            </button>
          </div>
          <label className="room-format" title="What the script is, so the room thinks in the right shape and length">
            <span className="ui-label">Format</span>
            <select className="ui-select" value={format} onChange={e => onChange({ ...room, format: e.target.value as RoomFormat })}>
              {FORMATS.map(f => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="room-scroll" ref={scrollRef}>
          {!cloud.available && (
            <div className="room-setup">
              <p>
                The room is a conversation about the story with a model that has read the script, the outline and the beat board. It proposes beats; you keep the ones you want, send
                them to the board or the outline, and write the scenes. It never writes a line of the script.
              </p>
              <p className="room-setup-reason">{cloud.reason}</p>
              <button className="ui-button outlined" onClick={openHostSettings}>
                Open Settings
              </button>
            </div>
          )}
          {cloud.available && messages.length === 0 && streaming === null && (
            <div className="room-empty">
              <p>
                Break the story with someone who has read every page. Talk about where it is going first; when you are ready, Lay out the beats puts the story on the board, and Break into
                scenes turns the beats into an outline. Nothing lands on the board or in the outline until you ask.
              </p>
              {treatment && <p>The room has read the treatment too. Ask it to plot the scenes, and send the ones you keep to the outline.</p>}
              <div className="room-starters">
                {(activeMode === 'plot' ? PLOT_STARTERS : STARTERS).map(s => (
                  <button key={s} className="ui-chip room-starter" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(m => {
            const parsed = m.role === 'room' ? parseReply(m.text, m.mode === 'beats' ? 'beats' : 'proposals') : null;
            const count = proposals.filter(p => p.messageId === m.id).length;
            const beatCount = parsed ? parsed.beats.length : 0;
            return (
              <div key={m.id} className={`room-message by-${m.role}`}>
                <div className="room-bubble">
                  <Prose text={parsed ? parsed.prose : m.text} />
                  {count > 0 && (
                    <div className="room-proposed">
                      {count} {count === 1 ? 'proposal' : 'proposals'} →
                    </div>
                  )}
                  {beatCount > 0 && (
                    <button className="room-proposed as-button" onClick={() => setPane('board')}>
                      {beatCount} {beatCount === 1 ? 'beat' : 'beats'} on the board →
                    </button>
                  )}
                  {parsed?.unreadable && (
                    <details className="room-unreadable">
                      <summary>The room wrote a block the app could not read, so nothing changed. Show it.</summary>
                      <pre>{parsed.unreadable}</pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
          {live && (
            <div className="room-message by-room">
              <div className="room-bubble">
                {live.prose ? <Prose text={live.prose} /> : <p className="room-thinking">Reading the script…</p>}
                {live.pending && <div className="room-proposed">{/```\s*beats/i.test(streaming ?? '') ? 'Writing beats to the board…' : 'Proposing…'}</div>}
              </div>
            </div>
          )}
          {error && <div className="room-error">{error}</div>}
        </div>
        <div className="room-steps">
          <button className="ui-chip room-step" onClick={layOutBeats} disabled={!cloud.available || streaming !== null} title="Read the script and the conversation and put the story on the board as beats">
            <SparkleIcon />
            <span>Lay out the beats</span>
          </button>
          <button className="ui-chip room-step" onClick={breakIntoScenes} disabled={!cloud.available || streaming !== null || board.beats.length === 0} title="Turn the beats on the board into scene proposals for the outline">
            <SparkleIcon />
            <span>Break into scenes</span>
          </button>
          {treatment && (
            <button className="ui-chip room-step" onClick={plotIt} disabled={!cloud.available || streaming !== null} title="Break the treatment into scenes, in order">
              <SparkleIcon />
              <span>Plot the treatment</span>
            </button>
          )}
        </div>
        <div className="room-composer">
          <textarea
            ref={composerRef}
            className="ui-textarea"
            rows={1}
            placeholder={!cloud.available ? 'Add a Gemini key in Settings to open the room.' : activeMode === 'plot' ? 'Ask for the next stretch of the treatment, or a different take on a scene… (Enter to send)' : 'Talk about the story… (Enter to send, Shift-Enter for a new line)'}
            value={draft}
            disabled={!cloud.available || streaming !== null}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="ui-button outlined" onClick={() => send(draft)} disabled={!cloud.available || streaming !== null || !draft.trim()}>
            <SparkleIcon />
            <span>Send</span>
          </button>
        </div>
      </div>

      {pane === 'board' && (
        <>
          <div
            className="room-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the board"
            title="Drag to resize the board; double-click to reset"
            onPointerDown={startSplit}
            onDoubleClick={resetSplit}
          />
          <section className="room-board" aria-label="Beat board" style={boardWidth ? { flex: `0 0 ${clampBoardWidth(boardWidth)}px` } : undefined}>
            <BeatBoard data={beats} onChange={onBeatsChange} view={view} state={state} onOpenScene={onOpenScene} highlightIds={freshBeats} compact />
          </section>
        </>
      )}
      <aside className="room-proposals" aria-label="Proposals" hidden={pane !== 'proposals'}>
        <section className="treatment" aria-label="Treatment">
          <div className="room-proposals-head">
            <span className="ui-label">Treatment</span>
            {treatment && treatmentDraft === null && (
              <button className="ui-button mini" onClick={() => setTreatmentOpen(o => !o)}>
                {treatmentOpen ? 'Hide' : 'Show'}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={TREATMENT_FILE_TYPES}
            onChange={e => {
              void importTreatment(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {treatmentDraft !== null ? (
            <div className="treatment-editor">
              <textarea className="ui-textarea" rows={10} placeholder="Paste the treatment here." value={treatmentDraft} onChange={e => setTreatmentDraft(e.target.value)} autoFocus />
              <div className="treatment-actions">
                <button className="ui-button mini" onClick={saveTreatmentDraft} disabled={!treatmentDraft.trim()}>
                  Save
                </button>
                <button className="ui-button mini" onClick={() => setTreatmentDraft(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : treatment ? (
            <div className="treatment-card">
              <div className="treatment-name" title={treatment.name}>
                {treatment.name}
              </div>
              <div className="treatment-meta">{wordCount(treatment.text).toLocaleString()} words</div>
              {treatmentOpen ? <div className="treatment-text">{treatment.text}</div> : <p className="treatment-excerpt">{treatment.text.slice(0, 220)}{treatment.text.length > 220 ? '…' : ''}</p>}
              <div className="treatment-actions">
                <button className="ui-button mini" onClick={plotIt} disabled={!cloud.available || streaming !== null} title="Ask the room to break the treatment into scenes">
                  <SparkleIcon />
                  <span>Plot it</span>
                </button>
                <button className="ui-button mini" onClick={() => setTreatmentDraft(treatment.text)}>
                  Edit
                </button>
                <button className="ui-button mini" onClick={() => fileRef.current?.click()}>
                  Replace…
                </button>
                <button className="ui-button mini dismiss" onClick={() => setTreatment(null)}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="treatment-card empty">
              <p className="room-proposals-empty">Bring a treatment or a prose outline (Word, PDF or text) and the room will help you plot it as scenes.</p>
              <div className="treatment-actions">
                <button className="ui-button mini" onClick={() => fileRef.current?.click()} title="Word (.docx), PDF, plain text, Markdown or Fountain">
                  Import file…
                </button>
                <button className="ui-button mini" onClick={() => setTreatmentDraft('')}>
                  Paste text…
                </button>
              </div>
            </div>
          )}
        </section>
        <div className="room-proposals-head">
          <span className="ui-label">Proposals</span>
          {open.length > 1 && (
            <span className="room-proposals-actions">
              <button className="ui-button mini" onClick={sendAllToOutline} title="Add every open proposal to the end of the script as a scene with its synopsis">
                Send all to outline
              </button>
              <button className="ui-button mini dismiss" onClick={dismissOpen} title="Clear the open proposals; kept ones stay">
                Dismiss all
              </button>
            </span>
          )}
        </div>
        {open.length === 0 && kept.length === 0 && <p className="room-proposals-empty">Beats and scenes the room proposes appear here. Keep them on the board, or turn them into scenes and write them.</p>}
        {open.map(p => (
          <div key={p.id} className={`proposal ${p.kind}`}>
            <div className="proposal-kind">{p.kind === 'scene' ? 'Scene' : 'Beat'}</div>
            <div className="proposal-title">{p.title}</div>
            {p.heading && <div className="proposal-heading">{p.heading}</div>}
            {p.text && <div className="proposal-text">{p.text}</div>}
            <div className="proposal-actions">
              <button className="ui-button mini" onClick={() => addScene(p)} title="Add a scene at the end of the script with this as its synopsis">
                <PlusIcon />
                <span>Scene</span>
              </button>
              {current && !current.opening && (
                <button className="ui-button mini" onClick={() => addScene(p, true)} title={`Add a scene after ${current.heading || 'the current scene'}`}>
                  After current
                </button>
              )}
              <button className="ui-button mini" onClick={() => toBoard(p)} title="Put this on the beat board">
                To board
              </button>
              <button className="ui-button mini dismiss" onClick={() => patchProposal(p.id, { status: 'dismissed' })}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
        {kept.length > 0 && (
          <>
            <div className="ui-label room-kept-label">Kept</div>
            {kept
              .slice()
              .reverse()
              .map(p => (
                <div key={p.id} className="proposal kept">
                  <div className="proposal-title">{p.title}</div>
                  {p.sceneOrdinal !== undefined ? (
                    <button className="ui-button mini" onClick={() => writeIt(p)} title="Open this scene in the script">
                      Write it →
                    </button>
                  ) : (
                    <span className="proposal-note">On the beat board</span>
                  )}
                </div>
              ))}
          </>
        )}
      </aside>
    </div>
  );
};

export default RoomView;
