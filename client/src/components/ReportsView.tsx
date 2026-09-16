import React, { useMemo, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { pageViewKey } from './editor-v2/plugins/pageView';
import { buildReport, charactersCSV, scenesCSV, ScriptReport } from './editor-v2/reports';
import { SceneInfo } from './editor-v2/scenes';
import { openHostSettings } from '../host';
import { useCloudAvailability, continuityReport, cachedContinuity, ContinuityReport } from '../ai';
import { SparkleIcon } from '../icons';
import './Reports.css';

interface ReportsViewProps {
  state: EditorState;
  onOpenScene: (scene: SceneInfo) => void;
}

type Section = 'characters' | 'scenes' | 'matrix' | 'dialogue' | 'continuity';

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
  const numbered = useMemo(() => report.scenes.filter(s => !s.scene.opening).map(s => s.scene), [report]);
  const cloud = useCloudAvailability();
  const [continuity, setContinuity] = useState<ContinuityReport | null>(() => cachedContinuity(state.doc));
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const readScript = async () => {
    if (reading) return;
    setReading(true);
    setReadError(null);
    try {
      setContinuity(await continuityReport(state.doc));
    } catch (err) {
      const message = (err as Error).message;
      if (message !== 'Cancelled.') setReadError(message);
    } finally {
      setReading(false);
    }
  };

  /** A scene number from the report → link into the script. */
  const sceneLink = (n: number, label?: string) => {
    const scene = numbered[n - 1];
    return scene ? (
      <button key={n} className="link" onClick={() => onOpenScene(scene)} title={scene.heading}>
        {label ?? `Scene ${n}`}
      </button>
    ) : (
      <span key={n}>{label ?? `Scene ${n}`}</span>
    );
  };

  return (
    <div className="reports">
      <div className="reports-scroll">
        <div className="reports-head">
        <nav className="reports-nav" aria-label="Report">
          {(
            [
              ['characters', 'Characters'],
              ['scenes', 'Scenes'],
              ['matrix', 'Who is in which scene'],
              ['dialogue', 'Dialogue'],
              ['continuity', 'Continuity']
            ] as [Section, string][]
          ).map(([id, label]) => (
            <button key={id} className={`ui-button${section === id ? ' active' : ''}`} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="reports-summary">
          {report.pages} pages · {report.sceneCount} scenes · {report.characters.length} speaking parts · {report.words.toLocaleString()} words
        </span>
        </div>

        {section === 'characters' && (
          <section>
            <div className="reports-section-head">
              <h2>Characters</h2>
              <button className="ui-button outlined" onClick={() => download('characters.csv', charactersCSV(report))}>Download CSV</button>
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
              <button className="ui-button outlined" onClick={() => download('scenes.csv', scenesCSV(report))}>Download CSV</button>
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

        {section === 'continuity' && (
          <section>
            <div className="reports-section-head">
              <h2>Continuity</h2>
              {cloud.available && (
                <button className="ui-button outlined" onClick={readScript} disabled={reading}>
                  <SparkleIcon />
                  <span>{reading ? 'Reading the script…' : continuity ? 'Read again' : 'Read the script'}</span>
                </button>
              )}
            </div>
            {!cloud.available && (
              <div className="continuity-setup">
                <p>
                  A model reads the whole script and lists what it establishes about each character and where the script contradicts itself. This needs a cloud model;
                  the script is sent only when you ask, and only after you confirm.
                </p>
                <p className="continuity-reason">{cloud.reason}</p>
                <button className="ui-button outlined" onClick={openHostSettings}>
                  Open Settings
                </button>
              </div>
            )}
            {cloud.available && !continuity && !reading && !readError && (
              <p className="continuity-intro">
                Reads all {report.pages} pages with {cloud.model} and lists contradictions with the lines in question, plus what the script establishes about each character. The
                script is sent to {cloud.provider === 'gemini' ? 'Google' : cloud.provider} after you confirm.
              </p>
            )}
            {reading && <p className="continuity-intro">Reading {report.pages} pages… this usually takes under a minute.</p>}
            {readError && <p className="continuity-error">{readError}</p>}
            {continuity && (
              <>
                <h3>Findings</h3>
                {continuity.findings.length === 0 && <p className="continuity-intro">No contradictions found.</p>}
                {continuity.findings.map((f, i) => (
                  <div key={i} className={`finding ${f.confidence}`}>
                    <div className="finding-head">
                      <span className="finding-title">{f.title}</span>
                      <span className="finding-meta">
                        {f.characters.join(', ')}
                        {f.characters.length ? ' · ' : ''}
                        {f.confidence} confidence
                      </span>
                    </div>
                    {f.detail && <p className="finding-detail">{f.detail}</p>}
                    <ul className="finding-scenes">
                      {f.scenes.map((s, j) => (
                        <li key={j}>
                          {sceneLink(s.scene)}
                          {s.quote && <span className="finding-quote">“{s.quote}”</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <h3>What the script establishes</h3>
                <table className="report-table">
                  <tbody>
                    {continuity.characters.map(c => (
                      <tr key={c.name}>
                        <td className="name">{c.name}</td>
                        <td>
                          <ul className="facts">
                            {c.facts.map((f, i) => (
                              <li key={i}>
                                {f.fact}
                                {f.scenes.length > 0 && <span className="fact-scenes"> {f.scenes.map(n => sceneLink(n, String(n)))}</span>}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="continuity-footer">
                  Read by {continuity.model} at {continuity.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. A model's reading, not a verdict: check each finding against the page.
                </p>
              </>
            )}
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
