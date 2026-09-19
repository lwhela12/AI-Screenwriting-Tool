import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Beat, BeatBoardData, BEAT_COLORS, CARD_WIDTH, CARD_GAP, arrangeBeats, readingOrder, sceneSummary, boardExtent, newBeatId, normalizeBeats } from './beats';
import { scenesOf, sceneAt, insertScene, SceneInfo } from './editor-v2/scenes';
import { PlusIcon } from '../icons';
import './BeatBoard.css';

interface BeatBoardProps {
  data: unknown;
  onChange: (data: BeatBoardData) => void;
  view: EditorView | null;
  state: EditorState;
  onOpenScene: (scene: SceneInfo) => void;
  /** Cards to draw attention to (just written or changed by the room). */
  highlightIds?: string[];
  /** Inside the Writers' Room: no hint line, smaller chrome. */
  compact?: boolean;
}

/**
 * A freeform board of beats. Double-click the board to add a beat, drag
 * cards to arrange them, edit in place, and send a beat into the script as
 * a new scene (its text becomes the scene synopsis).
 */
export const BeatBoard: React.FC<BeatBoardProps> = ({ data, onChange, view, state, onOpenScene, highlightIds = [], compact = false }) => {
  const board = useMemo(() => normalizeBeats(data), [data]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const dragRef = useRef(drag);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Measure both collapsed and expanded cards without changing the writer's layout.
  useLayoutEffect(() => {
    const measure = () => {
      const next = Object.fromEntries([...cardRefs.current].map(([id, el]) => [id, el.getBoundingClientRect().height]));
      setHeights(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    cardRefs.current.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [board.beats, expanded, editing]);
  const scenes = useMemo(() => scenesOf(state.doc), [state]);
  const current = sceneAt(scenes, state.selection.from);
  const numbered = scenes.filter(s => !s.opening);
  const jumpToScene = (n: number) => {
    const scene = numbered[n - 1];
    if (scene) onOpenScene(scene);
  };

  const update = (beats: Beat[]) => onChange({ version: 2, beats });
  const patch = (id: string, changes: Partial<Beat>) => update(board.beats.map(b => (b.id === id ? { ...b, ...changes } : b)));

  const addBeat = (x: number, y: number) => {
    const beat: Beat = { id: newBeatId(), title: '', text: '', color: BEAT_COLORS[0], x: Math.max(0, x), y: Math.max(0, y) };
    update([...board.beats, beat]);
    setEditing(beat.id);
  };

  const addBeatAtEnd = () => {
    const { height } = boardExtent(board, heights);
    addBeat(CARD_GAP, board.beats.length ? height + CARD_GAP : CARD_GAP);
  };

  const removeBeat = (id: string) => {
    if (!confirm('Delete this beat?')) return;
    update(board.beats.filter(b => b.id !== id));
  };

  const sendToScript = (beat: Beat, afterCurrent: boolean) => {
    if (!view) return;
    const after = afterCurrent && current && !current.opening ? current.ordinal : null;
    insertScene(view, after, beat.title, beat.text);
    const created = scenesOf(view.state.doc);
    const target = after === null ? created[created.length - 1] : created[after + 1];
    if (target) onOpenScene(target);
  };

  const onBoardPointerDown = (e: React.PointerEvent) => {
    if (e.target === boardRef.current && editing) setEditing(null);
  };

  const onBoardDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== boardRef.current) return;
    const rect = boardRef.current!.getBoundingClientRect();
    addBeat(e.clientX - rect.left - CARD_WIDTH / 2, e.clientY - rect.top - 20);
  };

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, beat: Beat) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    const rect = boardRef.current!.getBoundingClientRect();
    const next = { id: beat.id, dx: e.clientX - rect.left - beat.x, dy: e.clientY - rect.top - beat.y, x: beat.x, y: beat.y };
    dragRef.current = next;
    setDrag(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const active = dragRef.current;
    if (!active) return;
    const rect = boardRef.current!.getBoundingClientRect();
    const next = { ...active, x: Math.max(0, e.clientX - rect.left - active.dx), y: Math.max(0, e.clientY - rect.top - active.dy) };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = (commit: boolean) => {
    const active = dragRef.current;
    if (active && commit) patch(active.id, { x: active.x, y: active.y });
    dragRef.current = null;
    setDrag(null);
  };

  const moveWithKeys = (e: React.KeyboardEvent, beat: Beat) => {
    if (e.key === 'Escape') { endDrag(false); return; }
    const step = e.shiftKey ? 40 : 10;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!delta[e.key]) return;
    e.preventDefault();
    patch(beat.id, { x: Math.max(0, beat.x + delta[e.key][0]), y: Math.max(0, beat.y + delta[e.key][1]) });
  };

  const tidy = () => {
    const width = scrollRef.current?.clientWidth || 1000;
    const columns = Math.max(1, Math.floor((width - CARD_GAP) / (CARD_WIDTH + CARD_GAP)));
    update(arrangeBeats(board.beats, readingOrder(board.beats).map(b => b.id), columns, heights));
  };

  const displayedBoard = drag ? { ...board, beats: board.beats.map(b => b.id === drag.id ? { ...b, x: drag.x, y: drag.y } : b) } : board;
  const extent = boardExtent(displayedBoard, heights);
  const boardStyle = { minWidth: extent.width + CARD_GAP * 2, minHeight: extent.height + CARD_GAP * 2 };

  return (
    <div className={`beat-board${compact ? ' compact' : ''}`}>
      <div className="beat-board-toolbar">
        <span>{board.beats.length} {board.beats.length === 1 ? 'beat' : 'beats'}</span>
        <button className="ui-chip" onClick={tidy} disabled={!board.beats.length} title="Arrange cards in rows with room for their current height">Tidy board</button>
      </div>
      <div className="beat-board-scroll" ref={scrollRef}>
        <div ref={boardRef} className="beat-board-canvas" style={boardStyle} onDoubleClick={onBoardDoubleClick} onPointerDown={onBoardPointerDown}>
          {board.beats.length === 0 && <div className="beat-board-empty">Double-click anywhere to add your first beat.</div>}
          {board.beats.map(beat => (
            <div
              key={beat.id}
              ref={el => { if (el) cardRefs.current.set(beat.id, el); else cardRefs.current.delete(beat.id); }}
              className={`beat-card${drag?.id === beat.id ? ' dragging' : ''}${editing === beat.id ? ' editing' : ''}${highlightIds.includes(beat.id) ? ' fresh' : ''}${beat.gap ? ' gap' : ''}`}
              style={{ left: drag?.id === beat.id ? drag.x : beat.x, top: drag?.id === beat.id ? drag.y : beat.y, background: beat.color, width: CARD_WIDTH, color: '#1e1c19' }}
              onClick={() => setEditing(beat.id)}
            >
              <button
                className="beat-drag-handle"
                aria-label={`Move ${beat.title || 'beat'}`}
                title="Drag to move · arrow keys to nudge · Shift for larger steps"
                onPointerDown={e => startDrag(e, beat)}
                onPointerMove={onDragMove}
                onPointerUp={() => endDrag(true)}
                onPointerCancel={() => endDrag(false)}
                onLostPointerCapture={() => endDrag(false)}
                onKeyDown={e => moveWithKeys(e, beat)}
                onClick={e => e.stopPropagation()}
              ><span aria-hidden="true">⠿</span><span>Drag to move</span></button>
              <input
                aria-label="Beat title"
                className="beat-card-title"
                placeholder="Beat"
                value={beat.title}
                onChange={e => patch(beat.id, { title: e.target.value })}
                onFocus={() => setEditing(beat.id)}
              />
              <textarea
                aria-label="Beat description"
                className="beat-card-text"
                placeholder="What happens…"
                value={beat.text}
                rows={editing === beat.id ? 5 : 3}
                onChange={e => patch(beat.id, { text: e.target.value })}
                onFocus={() => setEditing(beat.id)}
              />
              {(beat.gap || (beat.scenes && beat.scenes.length > 0)) && (
                <div className="beat-card-scenes" onPointerDown={e => e.stopPropagation()}>
                  {beat.gap && <span className="beat-gap-label">Not in the script yet</span>}
                  {!!beat.scenes?.length && <button className="beat-scenes-toggle" aria-expanded={expanded === beat.id} onClick={() => setExpanded(expanded === beat.id ? null : beat.id)}>
                    {sceneSummary(beat.scenes)} <span aria-hidden="true">{expanded === beat.id ? '▴' : '▾'}</span>
                  </button>}
                  {expanded === beat.id && <div className="beat-scene-list">{beat.scenes?.map(n => (
                    <button key={n} className="beat-scene-chip" onClick={() => jumpToScene(n)} title={numbered[n - 1]?.heading || `Scene ${n}`}>
                      Sc {n}
                    </button>
                  ))}</div>}
                </div>
              )}
              {editing === beat.id && (
                <div className="beat-card-tools" onPointerDown={e => e.stopPropagation()}>
                  <div className="beat-card-colors">
                    {BEAT_COLORS.map(c => (
                      <button
                        key={c}
                        className={`beat-color${beat.color === c ? ' selected' : ''}`}
                        style={{ background: c }}
                        title="Colour"
                        onClick={() => patch(beat.id, { color: c })}
                      />
                    ))}
                  </div>
                  <div className="beat-card-actions">
                    <button onClick={() => sendToScript(beat, false)} title="Add a scene at the end of the script with this beat as its synopsis">
                      Send to script
                    </button>
                    {current && !current.opening && (
                      <button onClick={() => sendToScript(beat, true)} title={`Add a scene after ${current.heading || 'the current scene'}`}>
                        After current scene
                      </button>
                    )}
                    <button className="danger" onClick={() => removeBeat(beat.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {!compact && <div className="view-hint">Double-click anywhere to add a beat · use the handle to drag or arrow keys to move · Tidy board spaces cards into rows</div>}
      <button className="view-fab" onClick={addBeatAtEnd}>
        <PlusIcon />
        <span>Beat</span>
      </button>
    </div>
  );
};

export default BeatBoard;
