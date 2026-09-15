import React, { useState, useEffect, useRef, useCallback } from 'react';
import BeatBoard from './components/BeatBoard';
import ProseMirrorEditor from './components/editor-v2/ProseMirrorEditor';
import OutlineEditor from './components/OutlineEditor';
import { ProjectManager, ScreenplayProject, isLocalProject, saveLocalProject } from './components/ProjectManager';
import { ExportDialog } from './components/ExportDialog';
import { apiFetch } from './api';
import './App.css';

type ViewType = 'editor' | 'board' | 'outline';

interface Tab {
  id: ViewType;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'editor', label: 'Script Editor', icon: '📝' },
  { id: 'board', label: 'Beat Board', icon: '📋' },
  { id: 'outline', label: 'Outline', icon: '📑' }
];

type SaveState =
  | { kind: 'clean'; at?: Date }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'local'; at: Date }
  | { kind: 'error'; message: string };

const AUTOSAVE_DELAY_MS = 3000;

function describeSave(state: SaveState): { text: string; className: string } {
  const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  switch (state.kind) {
    case 'clean':
      return { text: state.at ? `Saved ${time(state.at)}` : 'Saved', className: 'save-clean' };
    case 'dirty':
      return { text: 'Unsaved changes', className: 'save-dirty' };
    case 'saving':
      return { text: 'Saving…', className: 'save-saving' };
    case 'local':
      return { text: `Saved locally ${time(state.at)} (server unreachable)`, className: 'save-local' };
    case 'error':
      return { text: `Save failed: ${state.message}`, className: 'save-error' };
  }
}

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('editor');
  const [currentProject, setCurrentProject] = useState<ScreenplayProject | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'clean' });

  // Latest editor state lives in refs so the save routine never closes over stale data.
  const contentRef = useRef<string>('');
  const beatsRef = useRef<any>(null);
  const outlineRef = useRef<any>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState(prev => (prev.kind === 'saving' ? prev : { kind: 'dirty' }));
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void save();
    }, AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const project = currentProjectRef.current;
    if (!project) return true;
    if (!dirtyRef.current) return true;
    if (savingRef.current) {
      // A save is in flight; the dirty flag will trigger another pass when it finishes.
      return false;
    }

    savingRef.current = true;
    dirtyRef.current = false;
    setSaveState({ kind: 'saving' });

    const updated: ScreenplayProject = {
      ...project,
      content: contentRef.current || project.content,
      beats: beatsRef.current ?? project.beats,
      outline: outlineRef.current ?? project.outline,
      updatedAt: new Date().toISOString()
    };

    let ok = false;
    try {
      if (isLocalProject(project)) {
        saveLocalProject(updated);
        currentProjectRef.current = updated;
        setCurrentProject(updated);
        setSaveState({ kind: 'local', at: new Date() });
        ok = true;
      } else {
        const saved = await apiFetch<ScreenplayProject>(`/screenplays/${project.id}`, {
          method: 'PUT',
          body: JSON.stringify(updated)
        });
        currentProjectRef.current = saved;
        setCurrentProject(saved);
        setSaveState({ kind: 'clean', at: new Date() });
        ok = true;
      }
    } catch (error: any) {
      if (error instanceof TypeError) {
        // Network failure: keep the writer's work in localStorage until the server is back.
        saveLocalProject(updated);
        setSaveState({ kind: 'local', at: new Date() });
        dirtyRef.current = true; // still needs to reach the server
      } else {
        console.error('Failed to save screenplay:', error);
        setSaveState({ kind: 'error', message: error?.message || 'unknown error' });
        dirtyRef.current = true;
      }
    } finally {
      savingRef.current = false;
    }

    if (dirtyRef.current && ok) {
      // Edits arrived while saving; schedule another pass.
      markDirty();
    }
    return ok;
  }, [markDirty]);

  const currentProjectRef = useRef<ScreenplayProject | null>(null);
  currentProjectRef.current = currentProject;

  const handleProjectSelect = (project: ScreenplayProject) => {
    setCurrentProject(project);
    currentProjectRef.current = project;
    contentRef.current = project.content;
    beatsRef.current = project.beats ?? null;
    outlineRef.current = project.outline ?? null;
    dirtyRef.current = false;
    setSaveState({ kind: 'clean' });
    setShowProjectManager(false);
    setActiveView('editor');
  };

  const handleContentChange = (content: string) => {
    contentRef.current = content;
    markDirty();
  };

  const handleBeatsChange = (data: any) => {
    if (JSON.stringify(data) === JSON.stringify(beatsRef.current)) return;
    beatsRef.current = data;
    markDirty();
  };

  const handleOutlineChange = (data: any) => {
    if (JSON.stringify(data) === JSON.stringify(outlineRef.current)) return;
    outlineRef.current = data;
    markDirty();
  };

  const openProjects = async () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    await save();
    setShowProjectManager(true);
  };

  // Cmd/Ctrl+S saves from anywhere in the app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (autosaveTimer.current) {
          clearTimeout(autosaveTimer.current);
          autosaveTimer.current = null;
        }
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [save]);

  // Warn before the tab closes with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    []
  );

  if (showProjectManager) {
    return <ProjectManager onProjectSelect={handleProjectSelect} />;
  }

  const saveInfo = describeSave(saveState);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title">
          <h1>{currentProject?.title || 'AI Screenwriting Tool'}</h1>
          <span className={`app-subtitle save-status ${saveInfo.className}`}>{saveInfo.text}</span>
        </div>
        <nav className="tab-navigation">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-button ${activeView === tab.id ? 'active' : ''}`}
              onClick={() => setActiveView(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="action-button" title="Projects" onClick={() => void openProjects()}>
            📁
          </button>
          <button
            className={`action-button ${saveState.kind === 'dirty' || saveState.kind === 'error' ? 'unsaved' : ''}`}
            title="Save (⌘S)"
            onClick={() => void save()}
          >
            💾
          </button>
          <button className="action-button" title="Export" onClick={() => setShowExportDialog(true)} disabled={!currentProject}>
            📤
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className={`view-container ${activeView === 'editor' ? 'active' : ''}`}>
          {activeView === 'editor' && currentProject && (
            <ProseMirrorEditor key={currentProject.id} initialContent={contentRef.current} onContentChange={handleContentChange} />
          )}
        </div>
        <div className={`view-container ${activeView === 'board' ? 'active' : ''}`}>
          {activeView === 'board' && currentProject && <BeatBoard screenplayId={currentProject.id} onDataChange={handleBeatsChange} />}
        </div>
        <div className={`view-container ${activeView === 'outline' ? 'active' : ''}`}>
          {activeView === 'outline' && currentProject && (
            <OutlineEditor screenplayId={currentProject.id} onDataChange={handleOutlineChange} />
          )}
        </div>
      </main>

      {showExportDialog && currentProject && (
        <ExportDialog project={{ ...currentProject, content: contentRef.current || currentProject.content }} onClose={() => setShowExportDialog(false)} />
      )}
    </div>
  );
};

export default App;
