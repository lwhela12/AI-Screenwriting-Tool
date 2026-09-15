import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import './ProjectManager.css';

export interface ScreenplayProject {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  contact?: string;
  format?: string;
  beats?: any;
  outline?: any;
}

const LOCAL_KEY = 'screenplayProjects';
const LOCAL_PREFIX = 'local-';

/** Projects created while the server was unreachable live only in this browser. */
export function isLocalProject(project: ScreenplayProject): boolean {
  return project.id.startsWith(LOCAL_PREFIX);
}

export function loadLocalProjects(): ScreenplayProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(p => p && typeof p.id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveLocalProject(project: ScreenplayProject): void {
  const projects = loadLocalProjects();
  const index = projects.findIndex(p => p.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.push(project);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error('Could not write to localStorage:', err);
  }
}

function removeLocalProject(id: string): void {
  const projects = loadLocalProjects().filter(p => p.id !== id);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

function newLocalId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${LOCAL_PREFIX}${rand}`;
}

interface ProjectManagerProps {
  onProjectSelect: (project: ScreenplayProject) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectSelect }) => {
  const [projects, setProjects] = useState<ScreenplayProject[]>([]);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectAuthor, setNewProjectAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    const local = loadLocalProjects();
    try {
      const remote = await apiFetch<ScreenplayProject[]>('/screenplays');
      setServerOnline(true);
      // Local copies of server projects (saved while offline) win if they are newer.
      const merged = remote.map(r => {
        const localCopy = local.find(l => l.id === r.id);
        return localCopy && localCopy.updatedAt > r.updatedAt ? localCopy : r;
      });
      const localOnly = local.filter(l => isLocalProject(l));
      setProjects([...merged, ...localOnly].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    } catch (err: any) {
      console.error('Failed to load screenplays:', err);
      setServerOnline(false);
      setProjects(local.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
      if (!(err instanceof TypeError)) setError(err?.message || 'Could not load screenplays');
    }
  };

  const createNewProject = async () => {
    if (!newProjectTitle.trim()) return;
    const now = new Date().toISOString();
    const draft = {
      title: newProjectTitle.trim(),
      author: newProjectAuthor.trim(),
      content: '',
      format: 'screenplay'
    };

    let project: ScreenplayProject;
    try {
      project = await apiFetch<ScreenplayProject>('/screenplays', { method: 'POST', body: JSON.stringify(draft) });
    } catch (err: any) {
      if (!(err instanceof TypeError)) {
        setError(`Could not create screenplay: ${err?.message || 'unknown error'}`);
        return;
      }
      project = { ...draft, id: newLocalId(), createdAt: now, updatedAt: now };
      saveLocalProject(project);
    }

    setProjects(prev => [project, ...prev]);
    setShowNewDialog(false);
    setNewProjectTitle('');
    setNewProjectAuthor('');
    onProjectSelect(project);
  };

  const deleteProject = async (project: ScreenplayProject) => {
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    try {
      if (!isLocalProject(project)) {
        await apiFetch<void>(`/screenplays/${project.id}`, { method: 'DELETE' });
      }
      removeLocalProject(project.id);
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch (err: any) {
      setError(`Could not delete screenplay: ${err?.message || 'unknown error'}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="project-manager">
      <div className="project-header">
        <h1>AI Screenwriting Tool</h1>
        <p className="tagline">Professional screenplay writing with AI assistance</p>
      </div>

      {serverOnline === false && (
        <div className="notice notice-warning">
          The screenplay server is unreachable. New scripts will be kept in this browser only until it is back.
        </div>
      )}
      {error && (
        <div className="notice notice-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className="project-actions">
        <button className="btn-primary" onClick={() => setShowNewDialog(true)}>
          <span className="icon">+</span>
          New Screenplay
        </button>
      </div>

      <div className="project-list">
        <h2>Your Screenplays</h2>
        {projects.length === 0 ? (
          <div className="empty-state">
            <p>No screenplays yet. Create your first one!</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(project => (
              <div key={project.id} className="project-card">
                <div className="project-info">
                  <h3>
                    {project.title}
                    {isLocalProject(project) && <span className="badge-local"> local</span>}
                  </h3>
                  {project.author && <p className="author">by {project.author}</p>}
                  <p className="date">Last updated: {formatDate(project.updatedAt)}</p>
                </div>
                <div className="project-actions">
                  <button className="btn-secondary" onClick={() => onProjectSelect(project)}>
                    Open
                  </button>
                  <button className="btn-danger" onClick={() => void deleteProject(project)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewDialog(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h2>New Screenplay</h2>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={newProjectTitle}
                onChange={e => setNewProjectTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void createNewProject();
                }}
                placeholder="Enter screenplay title"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Author</label>
              <input
                type="text"
                value={newProjectAuthor}
                onChange={e => setNewProjectAuthor(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void createNewProject();
                }}
                placeholder="Enter author name"
              />
            </div>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={() => setShowNewDialog(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => void createNewProject()} disabled={!newProjectTitle.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
