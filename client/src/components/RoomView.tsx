import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { scenesOf, sceneAt, SceneInfo } from './editor-v2/scenes';
import { BeatBoardData, Beat, BEAT_COLORS, CARD_GAP, boardExtent, newBeatId, normalizeBeats } from './beats';
import { BeatBoard } from './BeatBoard';
import { BoardIcon } from '../icons';
import { pageViewKey } from './editor-v2/plugins/pageView';
import { RoomData, RoomSession, RoomMode, RoomFormat, BeatDepth, BEAT_DEPTHS, RoomMessage, Proposal, Treatment, Conversation, ROOM_MODES, FORMATS, DEFAULT_FORMAT, BEATS_REQUEST, SCENES_REQUEST, applyBeatSheet, activeConversation, newConversation, withConversation, patchConversation, conversationLabel, SUMMARY_INSTRUCTIONS, summaryPrompt, parseSummary, startersFor, purposeFor, PLOT_REQUEST, TREATMENT_FILE_TYPES, normalizeRoom, newRoomId, roomContext, roomInstructions, roomTurns, parseReply, proposalSynopsis, acceptedProposals, placeScenes, placementLabel, treatmentFromFile, wordCount } from './room';
import { requestAI, openHostSettings } from '../host';
import { useCloudAvailability, useAIAvailability } from '../ai';
import { SparkleIcon, PlusIcon, SidebarIcon, ChevronDownIcon, ArrowUpIcon } from '../icons';
import { Popover, MenuItem } from './Popover';
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
  /** Survives leaving the view: the unsent message, the pane, the scroll position. */
  session: RoomSession;
  onSession: (patch: Partial<RoomSession>) => void;
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
/** The beat granularity as it reads in the composer's settings line. */
const DEPTH_SHORT: Record<BeatDepth, string> = { overview: 'Sequences', turns: 'Dramatic turns', scenes: 'Scene by scene' };

export const RoomView: React.FC<RoomViewProps> = ({ view, state, title, data, onChange, beats, onBeatsChange, onOpenScene, session, onSession }) => {
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
  const [pane, setPaneState] = useState<'board' | 'proposals'>(session.pane ?? 'proposals');
  const setPane = (next: 'board' | 'proposals') => {
    setPaneState(next);
    onSession({ pane: next });
  };
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
  // The mode lives with the room, so it holds across views and reopening the script.
  const mode: RoomMode = room.mode ?? 'break';
  const setMode = (next: RoomMode) => onChange({ ...room, mode: next });
  // Which composer menu is open: the actions, the mode, or the settings.
  const [menu, setMenu] = useState<'plus' | 'mode' | 'settings' | null>(null);
  const closeMenu = () => setMenu(null);
  const [draft, setDraftState] = useState(session.draft ?? '');
  const setDraft = (next: string) => {
    setDraftState(next);
    onSession({ draft: next });
  };
  const [streaming, setStreaming] = useState<string | null>(null);
  // The mode of the request in flight, which may be a step (beats, scenes) rather than the conversation's mode.
  const [streamingMode, setStreamingMode] = useState<RoomMode>('break');
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
  const beatDepth = room.beatDepth ?? 'turns';
  const layout = pageViewKey.getState(state)?.layout;
  // Plotting needs a treatment; fall back when it goes away.
  const activeMode: RoomMode = mode === 'plot' && !treatment ? 'break' : mode;

  // New messages scroll to the bottom; coming back to the view returns to where the writer was.
  const restoredScroll = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = session.scroll;
    if (!restoredScroll.current && saved && saved.conversationId === conversation?.id) {
      restoredScroll.current = true;
      el.scrollTop = saved.top;
      return;
    }
    restoredScroll.current = true;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, messages.length, streaming]);
  const conversationId = conversation?.id;
  useEffect(() => () => {
    const el = scrollRef.current;
    if (el) onSession({ scroll: { conversationId, top: el.scrollTop } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
    setStreamingMode(mode);
    try {
      const instructions = roomInstructions(mode, roomContext(state.doc, board, title, treatment, layout, base.proposals), format, { depth: beatDepth, purpose: purposeFor(activeMode) });
      const full = await requestAI(instructions, '', {
        tier: 'cloud',
        messages: roomTurns(base.messages, message),
        onChunk: (_delta, soFar) => setStreaming(soFar)
      });
      const reply: RoomMessage = { id: newRoomId('msg'), role: 'room', text: full, at: new Date().toISOString(), mode };
      const parsed = parseReply(full, mode === 'beats' ? 'beats' : 'proposals');
      if (parsed.pending) setError('The reply ended inside an unfinished block. That block was not applied. Ask the room to retry that portion; the analysis may be incomplete.');
      const fresh: Proposal[] = parsed.proposals.map(p => ({ id: newRoomId('prop'), ...p, status: 'open', messageId: reply.id }));
      // An accept block places proposals that were waiting when the writer sent this message.
      let placed: Proposal[] = [];
      if (parsed.accept) {
        const chosen = acceptedProposals(withWriter.proposals, parsed.accept);
        if (!chosen.length) setError('The room tried to place proposals that are no longer waiting. Nothing was added to the outline.');
        else if (!view) setError('The room tried to place proposals, but the script is not open. Nothing was added to the outline.');
        else placed = placeScenes(view, chosen);
      }
      const placedById = new Map(placed.filter(p => p.status === 'kept').map(p => [p.id, p]));
      if (placedById.size) reply.placed = placedById.size;
      const done: Conversation = { ...withWriter, updatedAt: reply.at, messages: [...withWriter.messages, reply], proposals: [...withWriter.proposals.map(p => placedById.get(p.id) ?? p), ...fresh] };
      onChange(withConversation(roomRef.current, done));
      if (parsed.beats.length) {
        // The room edits the board the writer is looking at: cards land, light up, and the pane opens.
        const applied = applyBeatSheet(boardRef.current, parsed.beats, board);
        onBeatsChange(applied.board);
        setFreshBeats(applied.changedIds);
        setPane('board');
        window.setTimeout(() => setFreshBeats([]), 6000);
      } else if (fresh.length || placedById.size) {
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

  /** One proposal becomes a scene: after the current scene when asked, else where it was proposed to go. */
  const addScene = (p: Proposal, afterCurrent = false) => {
    if (!view) return;
    const placed = placeScenes(view, [afterCurrent && current && !current.opening ? { ...p, after: sceneNumberOf(current) } : p]);
    patchProposal(p.id, { status: 'kept', sceneOrdinal: placed[0].sceneOrdinal });
  };

  /** The number a scene has in the outline (opening material is scene 0). */
  const sceneNumberOf = (scene: SceneInfo): number => scenes.filter(s => !s.opening && s.ordinal <= scene.ordinal).length;

  const sendAllToOutline = () => {
    if (!view || !conversation) return;
    const placed = new Map(placeScenes(view, proposals.filter(p => p.status === 'open')).map(p => [p.id, p]));
    onChange(patchConversation(room, conversation.id, { proposals: proposals.map(p => placed.get(p.id) ?? p) }));
  };

  const writeIt = (p: Proposal) => {
    if (!view || p.sceneOrdinal === undefined) return;
    const scene = scenesOf(view.state.doc)[p.sceneOrdinal];
    if (scene) onOpenScene(scene);
  };

  const open = proposals.filter(p => p.status === 'open');
  const modes = ROOM_MODES.filter(m => !m.step && (!m.needsTreatment || treatment));
  const modeInfo = ROOM_MODES.find(m => m.id === activeMode) ?? ROOM_MODES[0];
  const formatInfo = FORMATS.find(f => f.id === format) ?? FORMATS[0];
  const kept = proposals.filter(p => p.status === 'kept');
  const live = streaming !== null ? parseReply(streaming, streamingMode === 'beats' ? 'beats' : 'proposals') : null;
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
        <div className="room-pane-toggle" role="tablist" aria-label="Right pane">
          <button className={`ui-button${pane === 'board' ? ' active' : ''}`} onClick={() => setPane('board')} title="The beat board, live: the room writes to it and you can move things while you talk">
            <BoardIcon />
            <span>Board{board.beats.length ? ` ${board.beats.length}` : ''}</span>
          </button>
          <button className={`ui-button${pane === 'proposals' ? ' active' : ''}`} onClick={() => setPane('proposals')} title="Scene proposals and the treatment">
            <span>Proposals{open.length ? ` ${open.length}` : ''}</span>
          </button>
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
                Break the story with someone who has read every page. Talk about where it is going first; when you are ready, the + button lays the story out on the board as beats and
                breaks the beats into scenes. Nothing lands on the board or in the outline until you ask.
              </p>
              {treatment && <p>The room has read the treatment too. Ask it to plot the scenes, and send the ones you keep to the outline.</p>}
              <div className="room-starters">
                {startersFor(activeMode).map(s => (
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
                  {m.placed ? (
                    <button className="room-proposed as-button" onClick={() => setPane('proposals')}>
                      {m.placed} {m.placed === 1 ? 'scene' : 'scenes'} added to the outline →
                    </button>
                  ) : null}
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
        <div className={`room-composer${draft.trim() ? ' has-draft' : ''}`}>
          <textarea
            ref={composerRef}
            className="ui-textarea"
            rows={1}
            placeholder={!cloud.available ? 'Add a Gemini key in Settings to open the room.' : activeMode === 'plot' ? 'Ask for the next stretch of the treatment, or a different take on a scene…' : 'Talk about the story…'}
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
          <div className="room-composer-bar">
            <Popover open={menu === 'plus'} onClose={closeMenu} placement="above"
              trigger={
                <button className={`ui-button icon${menu === 'plus' ? ' active' : ''}`} onClick={() => setMenu(m => (m === 'plus' ? null : 'plus'))} disabled={!cloud.available} aria-haspopup="menu" aria-expanded={menu === 'plus'} title="Put the story on the board, break it into scenes, or bring a treatment">
                  <PlusIcon />
                </button>
              }>
              <MenuItem icon={<SparkleIcon />} hint="Read the script and the conversation; put the story on the board" disabled={streaming !== null} onClick={() => { closeMenu(); layOutBeats(); }}>
                Lay out the beats
              </MenuItem>
              <MenuItem icon={<SparkleIcon />} hint={board.beats.length ? 'Turn the beats on the board into scene proposals' : 'Needs beats on the board first'} disabled={streaming !== null || board.beats.length === 0} onClick={() => { closeMenu(); breakIntoScenes(); }}>
                Break into scenes
              </MenuItem>
              {treatment && (
                <MenuItem icon={<SparkleIcon />} hint="Break the treatment into scenes, in order" disabled={streaming !== null} onClick={() => { closeMenu(); plotIt(); }}>
                  Plot the treatment
                </MenuItem>
              )}
              <div className="ui-menu-sep" />
              {treatment ? (
                <>
                  <div className="ui-menu-title">Treatment · {treatment.name}</div>
                  <MenuItem onClick={() => { closeMenu(); setPane('proposals'); setTreatmentDraft(treatment.text); }}>Edit the treatment</MenuItem>
                  <MenuItem onClick={() => { closeMenu(); fileRef.current?.click(); }}>Replace with a file…</MenuItem>
                  <MenuItem tone="quiet" onClick={() => { closeMenu(); setTreatment(null); }}>Remove the treatment</MenuItem>
                </>
              ) : (
                <>
                  <MenuItem hint="Word, PDF, plain text, Markdown or Fountain; the room plots it as scenes" onClick={() => { closeMenu(); fileRef.current?.click(); }}>Add a treatment…</MenuItem>
                  <MenuItem onClick={() => { closeMenu(); setPane('proposals'); setTreatmentDraft(''); }}>Paste a treatment…</MenuItem>
                </>
              )}
            </Popover>
            <Popover open={menu === 'mode'} onClose={closeMenu} placement="above"
              trigger={
                <button className={`ui-button room-mode${menu === 'mode' ? ' active' : ''}`} onClick={() => setMenu(m => (m === 'mode' ? null : 'mode'))} aria-haspopup="menu" aria-expanded={menu === 'mode'} title={modeInfo.hint}>
                  <span>{modeInfo.label}</span>
                  <ChevronDownIcon />
                </button>
              }>
              {modes.map(m => (
                <MenuItem key={m.id} checked={activeMode === m.id} hint={m.hint} onClick={() => { setMode(m.id); closeMenu(); composerRef.current?.focus(); }}>
                  {m.label}
                </MenuItem>
              ))}
            </Popover>
            <Popover open={menu === 'settings'} onClose={closeMenu} placement="above"
              trigger={
                <button className={`ui-button room-settings${menu === 'settings' ? ' active' : ''}`} onClick={() => setMenu(m => (m === 'settings' ? null : 'settings'))} aria-haspopup="menu" aria-expanded={menu === 'settings'} title="What the script is, and how finely the room lays out beats">
                  {formatInfo.label} · {DEPTH_SHORT[beatDepth]}
                </button>
              }>
              <div className="ui-menu-fields">
                <label>
                  <span className="ui-label">Format</span>
                  <select className="ui-select" value={format} onChange={e => onChange({ ...room, format: e.target.value as RoomFormat })}>
                    {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="ui-label">Beats</span>
                  <select className="ui-select" aria-label="Beat detail" value={beatDepth} disabled={streaming !== null} onChange={e => onChange({ ...room, beatDepth: e.target.value as BeatDepth })}>
                    {BEAT_DEPTHS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
              </div>
            </Popover>
            <span className="room-composer-spacer" />
            <button className="ui-button icon room-send" onClick={() => send(draft)} disabled={!cloud.available || streaming !== null || !draft.trim()} title="Send (Enter; Shift-Enter for a new line)" aria-label="Send">
              <ArrowUpIcon />
            </button>
          </div>
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
            </div>
          ) : (
            <p className="room-proposals-empty">No treatment yet. Add one from the + button by the message box and the room will help you plot it as scenes.</p>
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
        {open.length === 0 && kept.length === 0 && <p className="room-proposals-empty">Beats and scenes the room proposes wait here. Keep them on the board, add them to the outline, or ask the room to send them over.</p>}
        {open.map(p => (
          <div key={p.id} className={`proposal ${p.kind}`}>
            <div className="proposal-kind">{p.kind === 'scene' ? 'Scene' : 'Beat'}</div>
            <div className="proposal-title">{p.title}</div>
            {p.heading && <div className="proposal-heading">{p.heading}</div>}
            {p.text && <div className="proposal-text">{p.text}</div>}
            {p.after !== undefined && <div className="proposal-note">{placementLabel(p.after, scenes.filter(s => !s.opening).length)}</div>}
            <div className="proposal-actions">
              <button className="ui-button mini" onClick={() => addScene(p)} title={`Add a scene ${placementLabel(p.after, scenes.filter(s => !s.opening).length).toLowerCase()} with this as its synopsis`}>
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
