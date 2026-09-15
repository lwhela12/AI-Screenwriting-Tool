import React, { useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Beat, BeatBoardData, BEAT_COLORS, CARD_WIDTH, CARD_GAP, boardExtent, emptyBoard, newBeatId, normalizeBeats } from './beats';
import { scenesOf, sceneAt, insertScene, SceneInfo } from './editor-v2/scenes';
import './BeatBoard.css';

interface BeatBoardProps {
  data: unknown;
  onChange: (data: BeatBoardData) => void;
  view: EditorView | null;
  state: EditorState;
  onOpenScene: (scene: SceneInfo) => void;
}

/**
 * A freeform board of beats. Double-click the board to add a beat, drag
 * cards to arrange them, edit in place, and send a beat into the script as
 * a new scene (its text becomes the scene synopsis).
 */
export const BeatBoard: React.FC<BeatBoardProps> = ({ data, onChange, view, state, onOpenScene }) => {
  const board = useMemo(() => normalizeBeats(data), [data]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const scenes = useMemo(() => scenesOf(state.doc), [state]);
  const current = sceneAt(scenes, state.selection.from);

  const update = (beats: Beat[]) => onChange({ version: 2, beats });
  const patch = (id: string, changes: Partial<Beat>) => update(board.beats.map(b => (b.id === id ? { ...b, ...changes } : b)));

  const addBeat = (x: number, y: number) => {
    const beat: Beat = { id: newBeatId(), title: '', text: '', color: BEAT_COLORS[0], x: Math.max(0, x), y: Math.max(0, y) };
    update([...board.beats, beat]);
    setEditing(beat.id);
  };

  const addBeatAtEnd = () => {
    const { height } = boardExtent(board);
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

  const startDrag = (e: React.PointerEvent, beat: Beat) => {
    if ((e.target as HTMLElement).closest('textarea, input, button')) return;
    const rect = boardRef.current!.getBoundingClientRect();
    setDrag({ id: beat.id, dx: e.clientX - rect.left - beat.x, dy: e.clientY - rect.top - beat.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = boardRef.current!.getBoundingClientRect();
    patch(drag.id, { x: Math.max(0, e.clientX - rect.left - drag.dx), y: Math.max(0, e.clientY - rect.top - drag.dy) });
  };

  const endDrag = () => setDrag(null);

  const extent = boardExtent(board.beats.length ? board : emptyBoard());
  const boardStyle = { minWidth: extent.width + CARD_GAP * 2, minHeight: extent.height + CARD_GAP * 2 };

  return (
    <div className="beat-board">
      <div className="beat-board-toolbar">
        <span className="beat-board-title">Beat Board</span>
        <span className="beat-board-hint">Double-click the board to add a beat · drag cards to arrange · send a beat to the script as a scene</span>
        <button className="beat-board-add" onClick={addBeatAtEnd}>
          + Beat
        </button>
      </div>
      <div className="beat-board-scroll">
        <div ref={boardRef} className="beat-board-canvas" style={boardStyle} onDoubleClick={onBoardDoubleClick} onPointerDown={onBoardPointerDown}>
          {board.beats.length === 0 && <div className="beat-board-empty">Double-click anywhere to add your first beat.</div>}
          {board.beats.map(beat => (
            <div
              key={beat.id}
              className={`beat-card${drag?.id === beat.id ? ' dragging' : ''}${editing === beat.id ? ' editing' : ''}`}
              style={{ left: beat.x, top: beat.y, background: beat.color, width: CARD_WIDTH, color: '#1e1c19' }}
              onPointerDown={e => startDrag(e, beat)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => setEditing(beat.id)}
            >
              <input
                className="beat-card-title"
                placeholder="Beat"
                value={beat.title}
                onChange={e => patch(beat.id, { title: e.target.value })}
                onFocus={() => setEditing(beat.id)}
              />
              <textarea
                className="beat-card-text"
                placeholder="What happens…"
                value={beat.text}
                rows={editing === beat.id ? 5 : 3}
                onChange={e => patch(beat.id, { text: e.target.value })}
                onFocus={() => setEditing(beat.id)}
              />
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
                      → Script (end)
                    </button>
                    {current && !current.opening && (
                      <button onClick={() => sendToScript(beat, true)} title={`Add a scene after ${current.heading || 'the current scene'}`}>
                        → After current scene
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
    </div>
  );
};

export default BeatBoard;
