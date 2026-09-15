import React, { useMemo, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { pageViewKey } from './editor-v2/plugins/pageView';
import { buildReport, charactersCSV, scenesCSV, ScriptReport } from './editor-v2/reports';
import { SceneInfo } from './editor-v2/scenes';
import './Reports.css';

interface ReportsViewProps {
  state: EditorState;
  onOpenScene: (scene: SceneInfo) => void;
}

type Section = 'characters' | 'scenes' | 'matrix' | 'dialogue';

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const Bar: React.FC<{ value: number; color?: string }> = ({ value, color }) => (
  <span className="report-bar">
    <span className="report-bar-fill" style={{ width: `${Math.max(1, Math.round(value * 100))}%`, background: color }} />
  </span>
);

/** Character, scene and dialogue reports computed live from the script. */
export const ReportsView: React.FC<ReportsViewProps> = ({ state, onOpenScene }) => {
  const report: ScriptReport = useMemo(() => buildReport(state.doc, pageViewKey.getState(state)?.layout), [state]);
  const [section, setSection] = useState<Section>('characters');
  const sceneNumber = (scene: SceneInfo) => scene.number || String(report.scenes.filter(s => !s.scene.opening).findIndex(s => s.scene.ordinal === scene.ordinal) + 1);

  return (
    <div className="reports">
      <div className="reports-toolbar">
        <span className="reports-title">Reports</span>
        <nav className="reports-nav">
          {(
            [
              ['characters', 'Characters'],
              ['scenes', 'Scenes'],
              ['matrix', 'Who is in which scene'],
              ['dialogue', 'Dialogue']
            ] as [Section, string][]
          ).map(([id, label]) => (
            <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="reports-summary">
          {report.pages} pages · {report.sceneCount} scenes · {report.characters.length} speaking parts · {report.words.toLocaleString()} words
        </span>
      </div>

      <div className="reports-scroll">
        {section === 'characters' && (
          <section>
            <div className="reports-section-head">
              <h2>Characters</h2>
              <button onClick={() => download('characters.csv', charactersCSV(report))}>Download CSV</button>
            </div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Character</th>
                  <th className="num">Scenes</th>
                  <th className="num">Speeches</th>
                  <th className="num">Words</th>
                  <th>Share of dialogue</th>
                  <th className="num">Longest speech</th>
                  <th>First / last scene</th>
                </tr>
              </thead>
              <tbody>
                {report.characters.map(c => {
                  const first = report.scenes.find(s => s.scene.ordinal === c.scenes[0])?.scene;
                  const last = report.scenes.find(s => s.scene.ordinal === c.scenes[c.scenes.length - 1])?.scene;
                  return (
                    <tr key={c.name}>
                      <td className="name">{c.name}</td>
                      <td className="num">{c.scenes.length}</td>
                      <td className="num">{c.speeches}</td>
                      <td className="num">{c.words.toLocaleString()}</td>
                      <td>
                        <Bar value={c.share} /> {pct(c.share)}
                      </td>
                      <td className="num">{c.longestSpeechWords}</td>
                      <td className="scenes">
                        {first && (
                          <button className="link" onClick={() => onOpenScene(first)}>
                            {first.opening ? 'opening' : sceneNumber(first)}
                          </button>
                        )}
                        {last && last !== first && (
                          <>
                            {' → '}
                            <button className="link" onClick={() => onOpenScene(last)}>
                              {sceneNumber(last)}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {report.characters.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">
                      No dialogue yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {section === 'scenes' && (
          <section>
            <div className="reports-section-head">
              <h2>Scenes</h2>
              <button onClick={() => download('scenes.csv', scenesCSV(report))}>Download CSV</button>
            </div>
            <table className="report-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Heading</th>
                  <th className="num">Page</th>
                  <th className="num">Length</th>
                  <th>Int/Ext</th>
                  <th>Time</th>
                  <th>Cast</th>
                  <th className="num">Dialogue words</th>
                  <th className="num">Action words</th>
                </tr>
              </thead>
              <tbody>
                {report.scenes
                  .filter(s => !s.scene.opening)
                  .map(s => (
                    <tr key={s.scene.index}>
                      <td className="num">{sceneNumber(s.scene)}</td>
                      <td>
                        <button className="link heading" onClick={() => onOpenScene(s.scene)}>
                          {s.scene.heading || '(untitled)'}
                        </button>
                      </td>
                      <td className="num">{s.scene.page}</td>
                      <td className="num">{s.scene.eighths ? `${s.scene.eighths}/8` : ''}</td>
                      <td>{s.intExt}</td>
                      <td>{s.time}</td>
                      <td className="cast">{s.cast.join(', ')}</td>
                      <td className="num">{s.dialogueWords}</td>
                      <td className="num">{s.actionWords}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}

        {section === 'matrix' && (
          <section>
            <div className="reports-section-head">
              <h2>Who is in which scene</h2>
            </div>
            <div className="matrix-wrap">
              <table className="report-table matrix">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Scene</th>
                    {report.matrix.characters.map(n => (
                      <th key={n} className="rot">
                        <span>{n}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.matrix.rows.map(row => (
                    <tr key={row.scene.index}>
                      <td className="num">{sceneNumber(row.scene)}</td>
                      <td>
                        <button className="link heading" onClick={() => onOpenScene(row.scene)}>
                          {row.scene.heading || '(untitled)'}
                        </button>
                      </td>
                      {row.present.map((p, i) => (
                        <td key={i} className={`cell${p ? ' on' : ''}`}>
                          {p ? '●' : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === 'dialogue' && (
          <section>
            <div className="reports-section-head">
              <h2>Dialogue</h2>
            </div>
            <div className="stat-tiles">
              <div className="stat-tile">
                <div className="stat-value">{pct(report.words ? report.dialogueWords / report.words : 0)}</div>
                <div className="stat-label">of words are dialogue</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{report.speeches.toLocaleString()}</div>
                <div className="stat-label">speeches</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{report.speeches ? Math.round(report.dialogueWords / report.speeches) : 0}</div>
                <div className="stat-label">words per speech</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{report.sceneCount ? Math.round(report.speeches / report.sceneCount) : 0}</div>
                <div className="stat-label">speeches per scene</div>
              </div>
            </div>
            <h3>Share of dialogue by character</h3>
            <table className="report-table">
              <tbody>
                {report.characters.map(c => (
                  <tr key={c.name}>
                    <td className="name">{c.name}</td>
                    <td className="wide">
                      <Bar value={c.share} />
                    </td>
                    <td className="num">{pct(c.share)}</td>
                    <td className="num">{c.words.toLocaleString()} words</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Dialogue against action, scene by scene</h3>
            <table className="report-table">
              <tbody>
                {report.scenes
                  .filter(s => !s.scene.opening)
                  .map(s => {
                    const total = s.dialogueWords + s.actionWords;
                    return (
                      <tr key={s.scene.index}>
                        <td className="num">{sceneNumber(s.scene)}</td>
                        <td>
                          <button className="link heading" onClick={() => onOpenScene(s.scene)}>
                            {s.scene.heading || '(untitled)'}
                          </button>
                        </td>
                        <td className="wide">
                          <Bar value={total ? s.dialogueWords / total : 0} />
                        </td>
                        <td className="num">{total ? pct(s.dialogueWords / total) : ''} dialogue</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
};

export default ReportsView;
