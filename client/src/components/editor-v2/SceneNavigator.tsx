import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { pageViewKey } from './plugins/pageView';
import { scenesOf, sceneAt, jumpToScene, moveScene, insertScene, SceneInfo } from './scenes';

interface SceneNavigatorProps {
  view: EditorView | null;
  state: EditorState;
}

function lengthLabel(eighths: number): string {
  if (eighths <= 0) return '';
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole && rest) return `${whole} ${rest}/8`;
  if (whole) return `${whole}`;
  return `${rest}/8`;
}

interface DropTarget {
  ordinal: number;
  after: boolean;
}

interface SceneRowProps {
  scene: SceneInfo;
  number: string | number;
  current: boolean;
  dragging: number | null;
  dropAfter: boolean | null;
  view: EditorView | null;
  onDrag: (ordinal: number | null) => void;
  onTarget: (target: DropTarget | null) => void;
  onDrop: (ordinal: number, after: boolean) => void;
}

/** A cursor move only changes the two highlighted rows, even in a long scene list. */
const SceneRow = memo(function SceneRow({ scene, number, current, dragging, dropAfter, view, onDrag, onTarget, onDrop }: SceneRowProps) {
  const dropClass = dropAfter === null ? '' : dropAfter ? ' drop-after' : ' drop-before';
  return (
    <div
      className={`scene-row${current ? ' current' : ''}${dragging === scene.ordinal ? ' dragging' : ''}${dropClass}`}
      draggable={!scene.opening}
      onDragStart={e => {
        onDrag(scene.ordinal);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        onDrag(null);
        onTarget(null);
      }}
      onDragOver={e => {
        if (dragging === null || scene.opening) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        onTarget({ ordinal: scene.ordinal, after: e.clientY > rect.top + rect.height / 2 });
      }}
      onDrop={e => {
        e.preventDefault();
        if (dropAfter !== null) onDrop(scene.ordinal, dropAfter);
      }}
      onClick={() => view && jumpToScene(view, scene)}
    >
      {scene.structure && <div className="scene-structure">{scene.structure}</div>}
      <span className="scene-number">{number}</span>
      <span className={`scene-heading-text${scene.opening ? ' opening' : ''}`}>
        {scene.color && <span className="scene-color-dot" style={{ background: scene.color }} />}
        {scene.opening ? 'Before the first scene' : scene.heading || '(untitled scene)'}
      </span>
      <span className="scene-page">
        p{scene.page}
        {scene.eighths ? ` · ${lengthLabel(scene.eighths)}` : ''}
      </span>
      {(scene.synopsis || scene.preview) && <span className="scene-preview">{scene.synopsis || scene.preview}</span>}
    </div>
  );
});

/**
 * The scene list beside the script. The highlight follows the cursor and the
 * list scrolls to keep it in view; click a scene to jump to it, drag to
 * reorder (the pages move with it). Synopses are edited in the inspector and
 * shown here as a one-line preview.
 */
export const SceneNavigator: React.FC<SceneNavigatorProps> = ({ view, state }) => {
  const layout = pageViewKey.getState(state)?.layout;
  // Selection changes keep the same document and layout; reuse their scene summaries.
  const scenes = useMemo(() => scenesOf(state.doc, layout), [state.doc, layout]);
  const current = sceneAt(scenes, state.selection.from);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the current scene's row visible as the cursor moves through the script.
  const currentKey = current ? (current.opening ? 'opening' : current.index) : null;
  useEffect(() => {
    if (dragging !== null || currentKey === null) return;
    const row = listRef.current?.querySelector<HTMLElement>('.scene-row.current');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [currentKey, dragging]);

  /** Drop the dragged scene before or after `target`; compute the ordinal it ends up at. */
  const onDrop = useCallback((target: number, after: boolean) => {
    if (view === null || dragging === null) return;
    const movingDown = dragging < target;
    const finalOrdinal = after ? (movingDown ? target : target + 1) : movingDown ? target - 1 : target;
    if (finalOrdinal !== dragging) moveScene(view, dragging, finalOrdinal);
    setDragging(null);
    setDropTarget(null);
  }, [view, dragging]);

  return (
    <aside className="scene-navigator" aria-label="Scenes">
      <div className="scene-navigator-header">
        <span>{scenes.filter(s => !s.opening).length} scenes</span>
        <span>{pageViewKey.getState(state)?.layout.pages.length ?? 1} pages</span>
      </div>
      <div className="scene-navigator-list" ref={listRef}>
        {scenes.map(scene => (
          <SceneRow
            key={scene.opening ? 'opening' : scene.index}
            scene={scene}
            number={scene.number || (scene.opening ? '' : scene.ordinal + (scenes[0]?.opening ? 0 : 1))}
            current={current?.ordinal === scene.ordinal}
            dragging={dragging}
            dropAfter={dropTarget?.ordinal === scene.ordinal ? dropTarget.after : null}
            view={view}
            onDrag={setDragging}
            onTarget={setDropTarget}
            onDrop={onDrop}
          />
        ))}
      </div>
      <div className="scene-navigator-footer">
        <button onClick={() => view && insertScene(view, current && !current.opening ? current.ordinal : null)}>+ New scene</button>
      </div>
    </aside>
  );
};

export default SceneNavigator;
