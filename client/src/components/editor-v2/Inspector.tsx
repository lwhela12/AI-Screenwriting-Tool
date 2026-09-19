import React, { useMemo, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { pageViewKey } from './plugins/pageView';
import { scenesOf, sceneAt, setSceneAttrs } from './scenes';
import { countWords } from './reports';
import { BEAT_COLORS } from '../beats';
import { useAIAvailability, draftSynopsis } from '../../ai';
import { SparkleIcon } from '../../icons';

interface InspectorProps {
  view: EditorView | null;
  state: EditorState;
  /** Word count when the document was opened, for "this session". */
  sessionStartWords: number;
}

function lengthLabel(eighths: number): string {
  if (eighths <= 0) return '';
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole && rest) return `${whole} ${rest}/8`;
  if (whole) return `${whole}`;
  return `${rest}/8`;
}

/** The right-hand panel: the scene under the cursor and the session's numbers. */
export const Inspector: React.FC<InspectorProps> = ({ view, state, sessionStartWords }) => {
  const layout = pageViewKey.getState(state)?.layout;
  const scenes = useMemo(() => scenesOf(state.doc, layout), [state.doc, layout]);
  const scene = sceneAt(scenes, state.selection.from);
  const words = useMemo(() => countWords(state.doc.textContent), [state.doc]);
  const numbered = scenes.filter(s => !s.opening);
  const ai = useAIAvailability();
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const draft = async () => {
    if (!view || !scene || drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const synopsis = await draftSynopsis(view.state.doc, scene);
      if (view.isDestroyed) return;
      setSceneAttrs(view, scene.index, { synopsis });
    } catch (err) {
      setDraftError((err as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  const sceneNumber = scene && !scene.opening ? scene.number || String(numbered.findIndex(s => s.ordinal === scene.ordinal) + 1) : '';

  return (
    <aside className="inspector" aria-label="Scene details">
      {scene && !scene.opening ? (
        <>
          <div className="inspector-scene">
            <div className="inspector-meta">
              Scene {sceneNumber} · page {scene.page}
              {scene.eighths ? ` · ${lengthLabel(scene.eighths)}` : ''}
            </div>
            <div className="inspector-heading">{scene.heading || '(untitled scene)'}</div>
          </div>
          <div>
            <div className="ui-label-row">
              <div className="ui-label">Synopsis</div>
              {ai.available && (
                <button className="ui-button mini" onClick={draft} disabled={drafting} title="Draft a synopsis from the scene's text, on this Mac">
                  <SparkleIcon />
                  <span>{drafting ? 'Drafting…' : 'Draft'}</span>
                </button>
              )}
            </div>
            <textarea
              className="ui-textarea"
              rows={4}
              placeholder="What happens in this scene…"
              value={scene.synopsis}
              onChange={e => view && setSceneAttrs(view, scene.index, { synopsis: e.target.value || null })}
            />
            {draftError && <div className="inspector-error">{draftError}</div>}
          </div>
          {scene.characters.length > 0 && (
            <div>
              <div className="ui-label">Cast</div>
              <div className="inspector-chips">
                {scene.characters.map(c => (
                  <span key={c} className="ui-chip">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="ui-label">Structure</div>
            <input
              className="ui-input"
              placeholder="Act One, Midpoint…"
              value={scene.structure || ''}
              onChange={e => view && setSceneAttrs(view, scene.index, { structure: e.target.value.trim() || null })}
            />
          </div>
          <div>
            <div className="ui-label">Colour</div>
            <div className="inspector-colors">
              {['', ...BEAT_COLORS].map(c => (
                <button
                  key={c || 'none'}
                  className={`inspector-color${(scene.color || '') === c ? ' selected' : ''}`}
                  style={{ background: c || 'var(--page)' }}
                  title={c ? 'Colour' : 'No colour'}
                  onClick={() => view && setSceneAttrs(view, scene.index, { color: c || null })}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="inspector-empty">Put the cursor in a scene to see its details here.</div>
      )}
      <div className="inspector-session">
        <div className="ui-label">This session</div>
        <div className="inspector-stat">
          <span>Words</span>
          <span>{(words - sessionStartWords >= 0 ? '+' : '') + (words - sessionStartWords).toLocaleString()}</span>
        </div>
        <div className="inspector-stat">
          <span>Script</span>
          <span>
            {words.toLocaleString()} words · {layout?.pages.length ?? 1} pages
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Inspector;
