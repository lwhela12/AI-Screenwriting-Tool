import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { scenesOf, sceneAt, insertScene, SceneInfo } from './editor-v2/scenes';
import { BeatBoardData, Beat, BEAT_COLORS, CARD_GAP, boardExtent, newBeatId, normalizeBeats } from './beats';
import { RoomData, RoomMode, RoomMessage, Proposal, ROOM_MODES, normalizeRoom, newRoomId, roomContext, roomInstructions, roomTurns, parseReply, proposalSynopsis } from './room';
import { requestAI, openHostSettings } from '../host';
import { useCloudAvailability } from '../ai';
import { SparkleIcon, PlusIcon } from '../icons';
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

const STARTERS = ['Where does the story stand?', 'What is missing between the midpoint and the end?', 'Give me three ways into the next scene.', 'Ask me what I have not decided yet.'];

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

export const RoomView: React.FC<RoomViewProps> = ({ view, state, title, data, onChange, beats, onBeatsChange, onOpenScene }) => {
  const room = useMemo(() => normalizeRoom(data), [data]);
  const board = useMemo(() => normalizeBeats(beats), [beats]);
  const cloud = useCloudAvailability();
  const [mode, setMode] = useState<RoomMode>('break');
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scenes = useMemo(() => scenesOf(state.doc), [state]);
  const current = sceneAt(scenes, state.selection.from);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.messages.length, streaming]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming !== null || !cloud.available) return;
    const writerMessage: RoomMessage = { id: newRoomId('msg'), role: 'writer', text: message, at: new Date().toISOString(), mode };
    const withWriter: RoomData = { ...room, messages: [...room.messages, writerMessage] };
    onChange(withWriter);
    setDraft('');
    setError(null);
    setStreaming('');
    try {
      const instructions = roomInstructions(mode, roomContext(state.doc, board, title));
      const full = await requestAI(instructions, '', {
        tier: 'cloud',
        messages: roomTurns(room.messages, message),
        onChunk: (_delta, soFar) => setStreaming(soFar)
      });
      const reply: RoomMessage = { id: newRoomId('msg'), role: 'room', text: full, at: new Date().toISOString(), mode };
      const parsed = parseReply(full);
      const proposals: Proposal[] = parsed.proposals.map(p => ({ id: newRoomId('prop'), ...p, status: 'open', messageId: reply.id }));
      onChange({ ...withWriter, messages: [...withWriter.messages, reply], proposals: [...room.proposals, ...proposals] });
    } catch (err) {
      const text = (err as Error).message;
      if (text !== 'Cancelled.') setError(text);
    } finally {
      setStreaming(null);
      composerRef.current?.focus();
    }
  };

  const patchProposal = (id: string, changes: Partial<Proposal>) => onChange({ ...room, proposals: room.proposals.map(p => (p.id === id ? { ...p, ...changes } : p)) });

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
    if (!view) return;
    let next = room.proposals;
    for (const p of room.proposals.filter(p => p.status === 'open')) {
      const ordinal = toScene(p, false);
      if (ordinal !== null) next = next.map(q => (q.id === p.id ? { ...q, status: 'kept', sceneOrdinal: ordinal } : q));
    }
    onChange({ ...room, proposals: next });
  };

  const writeIt = (p: Proposal) => {
    if (!view || p.sceneOrdinal === undefined) return;
    const scene = scenesOf(view.state.doc)[p.sceneOrdinal];
    if (scene) onOpenScene(scene);
  };

  const clear = () => {
    if (!confirm('Start a new conversation? Kept proposals stay in the script and on the board; the rest are cleared.')) return;
    onChange({ version: 1, messages: [], proposals: [] });
  };

  const open = room.proposals.filter(p => p.status === 'open');
  const kept = room.proposals.filter(p => p.status === 'kept');
  const live = streaming !== null ? parseReply(streaming) : null;

  return (
    <div className="room">
      <div className="room-conversation">
        <div className="room-modes" role="tablist" aria-label="Mode">
          {ROOM_MODES.map(m => (
            <button key={m.id} className={`ui-button${mode === m.id ? ' active' : ''}`} onClick={() => setMode(m.id)} title={m.hint}>
              {m.label}
            </button>
          ))}
          <span className="room-modes-spacer" />
          {room.messages.length > 0 && (
            <button className="ui-button" onClick={clear}>
              New conversation
            </button>
          )}
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
          {cloud.available && room.messages.length === 0 && streaming === null && (
            <div className="room-empty">
              <p>
                Break the story with someone who has read every page. Ask where it stands, what's missing, or for three ways into a scene. Proposals land on the right; keep the ones you want and
                write them.
              </p>
              <div className="room-starters">
                {STARTERS.map(s => (
                  <button key={s} className="ui-chip room-starter" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {room.messages.map(m => {
            const parsed = m.role === 'room' ? parseReply(m.text) : null;
            const count = room.proposals.filter(p => p.messageId === m.id).length;
            return (
              <div key={m.id} className={`room-message ${m.role}`}>
                <div className="room-bubble">
                  <Prose text={parsed ? parsed.prose : m.text} />
                  {count > 0 && (
                    <div className="room-proposed">
                      {count} {count === 1 ? 'proposal' : 'proposals'} →
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {live && (
            <div className="room-message room">
              <div className="room-bubble">
                {live.prose ? <Prose text={live.prose} /> : <p className="room-thinking">Reading the script…</p>}
                {live.pending && <div className="room-proposed">Proposing…</div>}
              </div>
            </div>
          )}
          {error && <div className="room-error">{error}</div>}
        </div>
        <div className="room-composer">
          <textarea
            ref={composerRef}
            className="ui-textarea"
            rows={2}
            placeholder={cloud.available ? 'Talk about the story… (Enter to send, Shift-Enter for a new line)' : 'Add a Gemini key in Settings to open the room.'}
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

      <aside className="room-proposals" aria-label="Proposals">
        <div className="room-proposals-head">
          <span className="ui-label">Proposals</span>
          {open.length > 1 && (
            <button className="ui-button mini" onClick={sendAllToOutline} title="Add every open proposal to the end of the script as a scene with its synopsis">
              Send all to outline
            </button>
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
