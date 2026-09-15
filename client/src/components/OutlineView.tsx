import React, { useMemo, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { pageViewKey } from './editor-v2/plugins/pageView';
import { scenesOf, sceneAt, moveScene, setSceneAttrs, setSceneHeading, insertScene, deleteScene, SceneInfo } from './editor-v2/scenes';
import { BEAT_COLORS } from './beats';
import './Outline.css';

interface OutlineViewProps {
  view: EditorView | null;
  state: EditorState;
  onOpenScene: (scene: SceneInfo) => void;
}

function lengthLabel(eighths: number): string {
  if (eighths <= 0) return '';
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole && rest) return `${whole} ${rest}/8`;
  if (whole) return `${whole} pg`;
  return `${rest}/8`;
}

/**
 * Index cards: every scene in the script as a card with its heading,
 * synopsis, cast, length and colour. Drag to reorder (the script follows),
 * add structure labels such as "Act Two" between cards, and add or delete
 * scenes. Everything here edits the script document directly.
 */
export const OutlineView: React.FC<OutlineViewProps> = ({ view, state, onOpenScene }) => {
  const scenes = useMemo(() => scenesOf(state.doc, pageViewKey.getState(state)?.layout).filter(s => !s.opening), [state]);
  const current = sceneAt(scenesOf(state.doc), state.selection.from);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ ordinal: number; after: boolean } | null>(null);
  const [labelEditing, setLabelEditing] = useState<number | null>(null);

  const onDrop = (target: number, after: boolean) => {
    if (view === null || dragging === null) return;
    const movingDown = dragging < target;
    const finalOrdinal = after ? (movingDown ? target : target + 1) : movingDown ? target - 1 : target;
    if (finalOrdinal !== dragging) moveScene(view, dragging, finalOrdinal);
    setDragging(null);
    setDropTarget(null);
  };

  const pages = pageViewKey.getState(state)?.layout.pages.length ?? 1;

  return (
    <div className="outline">
      <div className="outline-toolbar">
        <span className="outline-title">Outline</span>
        <span className="outline-hint">
          {scenes.length} scenes · {pages} pages · drag cards to reorder the script
        </span>
        <button className="outline-add" onClick={() => view && insertScene(view, scenes.length ? scenes[scenes.length - 1].ordinal : null)}>
          + Scene
        </button>
      </div>
      <div className="outline-scroll">
        <div className="outline-grid">
          {scenes.map(scene => {
            const isCurrent = current?.ordinal === scene.ordinal;
            const dropClass = dropTarget?.ordinal === scene.ordinal ? (dropTarget.after ? ' drop-after' : ' drop-before') : '';
            const editingLabel = labelEditing === scene.index;
            return (
              <div key={scene.index} className="outline-slot">
                {(scene.structure || editingLabel) && (
                  <div className="outline-structure">
                    {editingLabel ? (
                      <input
                        autoFocus
                        className="outline-structure-input"
                        placeholder="Act One, Midpoint, Sequence 3…"
                        defaultValue={scene.structure || ''}
                        onBlur={e => {
                          if (view) setSceneAttrs(view, scene.index, { structure: e.target.value.trim() || null });
                          setLabelEditing(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setLabelEditing(null);
                        }}
                      />
                    ) : (
                      <button className="outline-structure-label" onClick={() => setLabelEditing(scene.index)} title="Edit structure label">
                        {scene.structure}
                      </button>
                    )}
                  </div>
                )}
                <div
                  className={`outline-card${isCurrent ? ' current' : ''}${dragging === scene.ordinal ? ' dragging' : ''}${dropClass}`}
                  style={{ background: scene.color || '#fff' }}
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
                  <div className="outline-card-top">
                    <span className="outline-card-number">{scene.number || scene.ordinal + (scenes[0] && scenes[0].ordinal === 0 ? 1 : 0)}</span>
                    <span className="outline-card-meta">
                      p{scene.page}
                      {scene.eighths ? ` · ${lengthLabel(scene.eighths)}` : ''}
                    </span>
                  </div>
                  <input
                    className="outline-card-heading"
                    placeholder="INT. LOCATION - DAY"
                    value={scene.heading}
                    onChange={e => view && setSceneHeading(view, scene.index, e.target.value)}
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
                      {['#ffffff', ...BEAT_COLORS].map(c => (
                        <button
                          key={c}
                          className={`outline-color${(scene.color || '#ffffff') === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          title="Colour"
                          onClick={() => view && setSceneAttrs(view, scene.index, { color: c === '#ffffff' ? null : c })}
                        />
                      ))}
                    </div>
                    <div className="outline-card-actions">
                      <button onClick={() => onOpenScene(scene)}>Open</button>
                      {!scene.structure && !editingLabel && (
                        <button onClick={() => setLabelEditing(scene.index)} title="Add a structure label above this scene">
                          Label
                        </button>
                      )}
                      <button onClick={() => view && insertScene(view, scene.ordinal)} title="Add a scene after this one">
                        + After
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (view && confirm(`Delete "${scene.heading || 'this scene'}" and everything in it?`)) deleteScene(view, scene.ordinal);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {scenes.length === 0 && <div className="outline-empty">No scenes yet. Add one, or write a scene heading in the script.</div>}
        </div>
      </div>
    </div>
  );
};

export default OutlineView;
