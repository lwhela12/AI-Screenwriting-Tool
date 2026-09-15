import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import BeatBoard from './components/BeatBoard';
import ProseMirrorEditor from './components/editor-v2/ProseMirrorEditor';
import OutlineView from './components/OutlineView';
import ReportsView from './components/ReportsView';
import { jumpToScene, SceneInfo } from './components/editor-v2/scenes';
import type { BeatBoardData } from './components/beats';
import { isHosted, installHostApi, postToHost, serializeDocument, HostDocument } from './host';
import { ProjectManager, ScreenplayProject, isLocalProject, saveLocalProject } from './components/ProjectManager';
import { ExportDialog } from './components/ExportDialog';
import { apiFetch } from './api';
import type { TitlePageData } from './components/editor-v2/TitleSheet';
import './App.css';

type ViewType = 'editor' | 'board' | 'outline' | 'reports';

interface Tab {
  id: ViewType;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'editor', label: 'Script Editor', icon: '📝' },
  { id: 'board', label: 'Beat Board', icon: '📋' },
  { id: 'outline', label: 'Outline', icon: '📑' },
  { id: 'reports', label: 'Reports', icon: '📊' }
];

type SaveState =
  | { kind: 'clean'; at?: Date }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'local'; at: Date }
  | { kind: 'error'; message: string };

const AUTOSAVE_DELAY_MS = isHosted() ? 400 : 3000;

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

const HOSTED = isHosted();

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('editor');
  const [currentProject, setCurrentProject] = useState<ScreenplayProject | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(!HOSTED);
  const [hostGeneration, setHostGeneration] = useState(0);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'clean' });
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [beats, setBeats] = useState<BeatBoardData | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

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

  /** In the native app the host owns the file: every change is handed over as the serialized document. */
  const hostDocument = (): HostDocument | null => {
    const project = currentProjectRef.current;
    if (!project) return null;
    return { title: project.title, author: project.author || '', contact: project.contact || '', content: contentRef.current || project.content, beats: beatsRef.current ?? null };
  };

  const save = useCallback(async (): Promise<boolean> => {
    const project = currentProjectRef.current;
    if (!project) return true;
    if (HOSTED) {
      const doc = hostDocument();
      if (doc) postToHost({ type: 'changed', text: serializeDocument(doc) });
      dirtyRef.current = false;
      setSaveState({ kind: 'clean', at: new Date() });
      return true;
    }
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

  // Native host: expose the bridge once; the host loads the document through it.
  useEffect(() => {
    if (!HOSTED) return;
    installHostApi({
      getView: () => editorViewRef.current,
      getDocument: hostDocument,
      loadDocument: (doc: HostDocument) => {
        const now = new Date().toISOString();
        const project: ScreenplayProject = { id: `host-${Date.now()}`, title: doc.title || 'Untitled', author: doc.author, contact: doc.contact, content: doc.content, beats: doc.beats, createdAt: now, updatedAt: now };
        currentProjectRef.current = project;
        setCurrentProject(project);
        contentRef.current = project.content;
        beatsRef.current = project.beats ?? null;
        setBeats(project.beats ?? null);
        dirtyRef.current = false;
        setEditorState(null);
        editorViewRef.current = null;
        setShowProjectManager(false);
        setActiveView('editor');
        setHostGeneration(g => g + 1);
      },
      setTheme: (name: string) => {
        document.documentElement.dataset.theme = name;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProjectSelect = (project: ScreenplayProject) => {
    setCurrentProject(project);
    currentProjectRef.current = project;
    contentRef.current = project.content;
    beatsRef.current = project.beats ?? null;
    setBeats(project.beats ?? null);
    outlineRef.current = project.outline ?? null;
    setEditorState(null);
    editorViewRef.current = null;
    dirtyRef.current = false;
    setSaveState({ kind: 'clean' });
    setShowProjectManager(false);
    setActiveView('editor');
  };

  const handleContentChange = (content: string) => {
    contentRef.current = content;
    markDirty();
  };

  const handleTitlePageChange = (data: TitlePageData) => {
    setCurrentProject(prev => (prev ? { ...prev, ...data } : prev));
    if (currentProjectRef.current) currentProjectRef.current = { ...currentProjectRef.current, ...data };
    markDirty();
  };

  const handleBeatsChange = (data: BeatBoardData) => {
    if (JSON.stringify(data) === JSON.stringify(beatsRef.current)) return;
    beatsRef.current = data;
    setBeats(data);
    markDirty();
  };

  /** Switch to the script and put the cursor at a scene. */
  const openScene = (scene: SceneInfo) => {
    setActiveView('editor');
    requestAnimationFrame(() => {
      if (editorViewRef.current) jumpToScene(editorViewRef.current, scene);
    });
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
  if (HOSTED && !currentProject) {
    return <div className="app-container" />; // the host is about to hand us the document
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
          {!HOSTED && (
            <button className="action-button" title="Projects" onClick={() => void openProjects()}>
              📁
            </button>
          )}
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
        {/* The editor stays mounted on every tab so the outline and beat board can act on the live script. */}
        <div className={`view-container ${activeView === 'editor' ? 'active' : ''}`}>
          {currentProject && (
            <ProseMirrorEditor
              key={`${currentProject.id}-${hostGeneration}`}
              initialContent={contentRef.current}
              onContentChange={handleContentChange}
              titlePage={{ title: currentProject.title, author: currentProject.author || '', contact: currentProject.contact || '' }}
              onTitlePageChange={handleTitlePageChange}
              onReady={view => {
                editorViewRef.current = view;
              }}
              onStateChange={setEditorState}
            />
          )}
        </div>
        <div className={`view-container ${activeView === 'board' ? 'active' : ''}`}>
          {activeView === 'board' && currentProject && editorState && (
            <BeatBoard data={beats} onChange={handleBeatsChange} view={editorViewRef.current} state={editorState} onOpenScene={openScene} />
          )}
        </div>
        <div className={`view-container ${activeView === 'outline' ? 'active' : ''}`}>
          {activeView === 'outline' && currentProject && editorState && (
            <OutlineView view={editorViewRef.current} state={editorState} onOpenScene={openScene} />
          )}
        </div>
        <div className={`view-container ${activeView === 'reports' ? 'active' : ''}`}>
          {activeView === 'reports' && currentProject && editorState && <ReportsView state={editorState} onOpenScene={openScene} />}
        </div>
      </main>

      {showExportDialog && currentProject && (
        <ExportDialog project={{ ...currentProject, content: contentRef.current || currentProject.content }} onClose={() => setShowExportDialog(false)} />
      )}
    </div>
  );
};

export default App;
