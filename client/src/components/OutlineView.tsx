import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { pageViewKey } from './editor-v2/plugins/pageView';
import { scenesOf, sceneAt, moveScene, setSceneAttrs, setSceneHeading, insertScene, deleteScene, SceneInfo } from './editor-v2/scenes';
import { BEAT_COLORS } from './beats';
import { PlusIcon } from '../icons';
import './Outline.css';

interface OutlineViewProps {
  view: EditorView | null;
  state: EditorState;
  onOpenScene: (scene: SceneInfo) => void;
}

interface Lane {
  /** Index of the scene whose structure label opens this lane, or null for the unlabelled run at the top. */
  anchor: number | null;
  label: string | null;
  scenes: SceneInfo[];
}

function lengthLabel(eighths: number): string {
  if (eighths <= 0) return '';
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole && rest) return `${whole} ${rest}/8`;
  if (whole) return `${whole} pg`;
  return `${rest}/8`;
}

/** A one-line-or-more textarea that grows with its text; Enter commits instead of adding a line. */
const GrowingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = props => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        props.onKeyDown?.(e);
      }}
    />
  );
};

/** Group scenes into lanes: each structure label ("Act Two", "Midpoint") starts a new lane. */
function lanesOf(scenes: SceneInfo[]): Lane[] {
  const lanes: Lane[] = [];
  for (const scene of scenes) {
    if (scene.structure || lanes.length === 0) lanes.push({ anchor: scene.structure ? scene.index : null, label: scene.structure || null, scenes: [] });
    lanes[lanes.length - 1].scenes.push(scene);
  }
  return lanes;
}

/**
 * Index cards: every scene in the script as a card with its heading,
 * synopsis, cast, length and colour, grouped into lanes by structure label.
 * Drag to reorder (the script follows), label a card to start a new act or
 * sequence, add or delete scenes. Everything here edits the script directly.
 */
export const OutlineView: React.FC<OutlineViewProps> = ({ view, state, onOpenScene }) => {
  const scenes = useMemo(() => scenesOf(state.doc, pageViewKey.getState(state)?.layout).filter(s => !s.opening), [state]);
  const lanes = useMemo(() => lanesOf(scenes), [scenes]);
  const current = sceneAt(scenesOf(state.doc), state.selection.from);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ ordinal: number; after: boolean } | null>(null);
  const [labelEditing, setLabelEditing] = useState<number | null>(null);
  const numberOffset = scenes[0] && scenes[0].ordinal === 0 ? 1 : 0;

  const onDrop = (target: number, after: boolean) => {
    if (view === null || dragging === null) return;
    const movingDown = dragging < target;
    const finalOrdinal = after ? (movingDown ? target : target + 1) : movingDown ? target - 1 : target;
    if (finalOrdinal !== dragging) moveScene(view, dragging, finalOrdinal);
    setDragging(null);
    setDropTarget(null);
  };

  const commitLabel = (sceneIndex: number, value: string) => {
    if (view) setSceneAttrs(view, sceneIndex, { structure: value.trim() || null });
    setLabelEditing(null);
  };

  const labelInput = (sceneIndex: number, initial: string) => (
    <input
      autoFocus
      className="outline-lane-input"
      placeholder="Act One, Midpoint, Sequence 3…"
      defaultValue={initial}
      onBlur={e => commitLabel(sceneIndex, e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setLabelEditing(null);
      }}
    />
  );

  return (
    <div className="outline">
      <div className="outline-scroll">
        {lanes.map((lane, i) => (
          <section key={lane.anchor ?? 'top'} className="outline-lane">
            {(lanes.length > 1 || lane.label) && (
              <header className="outline-lane-head">
                {lane.anchor !== null && labelEditing === lane.anchor ? (
                  labelInput(lane.anchor, lane.label || '')
                ) : lane.label ? (
                  <button className="outline-lane-label" onClick={() => setLabelEditing(lane.anchor)} title="Rename this label">
                    {lane.label}
                  </button>
                ) : (
                  <span className="outline-lane-label unlabelled">{i === 0 ? 'Opening' : 'Scenes'}</span>
                )}
                <span className="outline-lane-rule" />
                <span className="outline-lane-count">
                  {lane.scenes.length} {lane.scenes.length === 1 ? 'scene' : 'scenes'}
                </span>
              </header>
            )}
            <div className="outline-grid">
              {lane.scenes.map(scene => {
                const isCurrent = current?.ordinal === scene.ordinal;
                const dropClass = dropTarget?.ordinal === scene.ordinal ? (dropTarget.after ? ' drop-after' : ' drop-before') : '';
                const editingNewLabel = labelEditing === scene.index && !scene.structure;
                return (
                  <div
                    key={scene.index}
                    className={`outline-card${isCurrent ? ' current' : ''}${dragging === scene.ordinal ? ' dragging' : ''}${dropClass}`}
                    style={{ borderTopColor: scene.color || 'var(--line)' }}
                    draggable
                    onDragStart={e => {
                      setDragging(scene.ordinal);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onDragOver={e => {
                      if (dragging === null) return;
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDropTarget({ ordinal: scene.ordinal, after: e.clientX > rect.left + rect.width / 2 });
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      if (dropTarget) onDrop(dropTarget.ordinal, dropTarget.after);
                    }}
                  >
                    {editingNewLabel && <div className="outline-card-newlabel">{labelInput(scene.index, '')}</div>}
                    <div className="outline-card-top">
                      <span className="outline-card-number">{scene.number || scene.ordinal + numberOffset}</span>
                      <span className="outline-card-meta">
                        p{scene.page}
                        {scene.eighths ? ` · ${lengthLabel(scene.eighths)}` : ''}
                      </span>
                    </div>
                    <GrowingTextarea
                      className="outline-card-heading"
                      placeholder="INT. LOCATION - DAY"
                      value={scene.heading}
                      onChange={e => view && setSceneHeading(view, scene.index, e.target.value.replace(/\n/g, ' '))}
                      onMouseDown={e => e.stopPropagation()}
                    />
                    <textarea
                      className="outline-card-synopsis"
                      placeholder="What happens in this scene…"
                      value={scene.synopsis}
                      rows={4}
                      onChange={e => view && setSceneAttrs(view, scene.index, { synopsis: e.target.value || null })}
                      onMouseDown={e => e.stopPropagation()}
                    />
                    {scene.characters.length > 0 && <div className="outline-card-cast">{scene.characters.join(', ')}</div>}
                    <div className="outline-card-tools">
                      <div className="outline-card-colors">
                        <button
                          className={`outline-color none${!scene.color ? ' selected' : ''}`}
                          title="No colour"
                          onClick={() => view && setSceneAttrs(view, scene.index, { color: null })}
                        />
                        {BEAT_COLORS.map(c => (
                          <button
                            key={c}
                            className={`outline-color${scene.color === c ? ' selected' : ''}`}
                            style={{ background: c }}
                            title="Colour"
                            onClick={() => view && setSceneAttrs(view, scene.index, { color: c })}
                          />
                        ))}
                      </div>
                      <div className="outline-card-actions">
                        <button className="outline-action" onClick={() => onOpenScene(scene)}>
                          Open
                        </button>
                        {!scene.structure && (
                          <button className="outline-action" onClick={() => setLabelEditing(scene.index)} title="Start an act or sequence at this scene">
                            Label
                          </button>
                        )}
                        <button className="outline-action" onClick={() => view && insertScene(view, scene.ordinal)} title="Add a scene after this one">
                          Add after
                        </button>
                        <button
                          className="outline-action danger"
                          onClick={() => {
                            if (view && confirm(`Delete "${scene.heading || 'this scene'}" and everything in it?`)) deleteScene(view, scene.ordinal);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {scenes.length === 0 && <div className="outline-empty">No scenes yet. Add one, or write a scene heading in the script.</div>}
      </div>
      <div className="view-hint">Drag cards to reorder the script · label a card to start an act</div>
      <button className="view-fab" onClick={() => view && insertScene(view, scenes.length ? scenes[scenes.length - 1].ordinal : null)}>
        <PlusIcon />
        <span>Scene</span>
      </button>
    </div>
  );
};

export default OutlineView;
