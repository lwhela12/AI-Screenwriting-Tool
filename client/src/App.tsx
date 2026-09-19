import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import BeatBoard from './components/BeatBoard';
import ProseMirrorEditor from './components/editor-v2/ProseMirrorEditor';
import OutlineView from './components/OutlineView';
import ReportsView from './components/ReportsView';
import { jumpToScene, SceneInfo } from './components/editor-v2/scenes';
import { ProjectManager, ScreenplayProject, isLocalProject, saveLocalProject } from './components/ProjectManager';
import { ExportDialog } from './components/ExportDialog';
import { apiFetch } from './api';
import { exportToPDF, exportToFDX, exportToFountain, exportToText } from './utils/exporters';
import type { TitlePageData } from './components/editor-v2/TitleSheet';
import type { BeatBoardData } from './components/beats';
import { RoomView } from './components/RoomView';
import type { RoomData } from './components/room';
import { isHosted, installHostApi, postToHost, serializeDocument, HostDocument } from './host';
import { openSearch } from './components/editor-v2/plugins/search';
import { undo, redo } from 'prosemirror-history';
import { SidebarIcon, InspectorIcon, SearchIcon, FocusIcon, DocIcon, GridIcon, BoardIcon, ReportIcon, ExportIcon, FolderIcon, PaletteIcon, RoomIcon } from './icons';
import './theme.css';
import './App.css';

type ViewType = 'editor' | 'board' | 'outline' | 'room' | 'reports';

const tabs: { id: ViewType; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Script', icon: <DocIcon /> },
  { id: 'outline', label: 'Outline', icon: <GridIcon /> },
  { id: 'board', label: 'Beats', icon: <BoardIcon /> },
  { id: 'room', label: 'Room', icon: <RoomIcon /> },
  { id: 'reports', label: 'Reports', icon: <ReportIcon /> }
];

/** ⌥⌘1–4 switch views, in tab order. */
const VIEW_KEYS: ViewType[] = tabs.map(t => t.id);

const THEMES = [
  { id: 'paper', label: 'Paper' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'nord', label: 'Nord' },
  { id: 'rose-pine', label: 'Rose Pine' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'catppuccin', label: 'Catppuccin' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'gruvbox', label: 'Gruvbox' }
];

type SaveState = { kind: 'clean'; at?: Date } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'local'; at: Date } | { kind: 'error'; message: string };

const HOSTED = isHosted();
const AUTOSAVE_DELAY_MS = 3000;

function describeSave(state: SaveState): { text: string; className: string } {
  const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  switch (state.kind) {
    case 'clean':
      return { text: HOSTED ? '' : state.at ? `Saved ${time(state.at)}` : 'Saved', className: 'save-clean' };
    case 'dirty':
      return { text: HOSTED ? 'Edited' : 'Unsaved changes', className: 'save-dirty' };
    case 'saving':
      return { text: 'Saving…', className: 'save-saving' };
    case 'local':
      return { text: `Saved locally ${time(state.at)}`, className: 'save-local' };
    case 'error':
      return { text: `Save failed: ${state.message}`, className: 'save-error' };
  }
}

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('editor');
  const [currentProject, setCurrentProject] = useState<ScreenplayProject | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(!HOSTED);
  const [hostGeneration, setHostGeneration] = useState(0);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'clean' });
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [beats, setBeats] = useState<BeatBoardData | null>(null);
  const [room, setRoom] = useState<unknown>(null);
  const roomRef = useRef<unknown>(null);
  const [showScenes, setShowScenes] = useState(() => readPref('ui.scenes', true));
  const [showInspector, setShowInspector] = useState(() => readPref('ui.inspector', true));
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('ui.theme') || 'paper';
    } catch {
      return 'paper';
    }
  });
  const editorViewRef = useRef<EditorView | null>(null);

  // Latest editor state lives in refs so the save routine never closes over stale data.
  const contentRef = useRef<string>('');
  const beatsRef = useRef<any>(null);
  const outlineRef = useRef<any>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentProjectRef = useRef<ScreenplayProject | null>(null);
  currentProjectRef.current = currentProject;

  // Theme: the browser build sets it here; the native app sets it through the bridge.
  useEffect(() => {
    if (HOSTED) return;
    document.documentElement.dataset.theme = theme;
    writePref('ui.theme', theme);
  }, [theme]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState(prev => (prev.kind === 'saving' ? prev : { kind: 'dirty' }));
    // NSDocument owns disk autosave. Keep its snapshot current immediately so
    // native Save/Save As/Close cannot act on the previous browser debounce.
    if (HOSTED) {
      void save();
      return;
    }
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
    return { title: project.title, author: project.author || '', contact: project.contact || '', content: contentRef.current || project.content, beats: beatsRef.current ?? null, room: roomRef.current ?? null };
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
    if (savingRef.current) return false;

    savingRef.current = true;
    dirtyRef.current = false;
    setSaveState({ kind: 'saving' });

    const updated: ScreenplayProject = {
      ...project,
      content: contentRef.current || project.content,
      beats: beatsRef.current ?? project.beats,
      room: roomRef.current ?? project.room,
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
        const saved = await apiFetch<ScreenplayProject>(`/screenplays/${project.id}`, { method: 'PUT', body: JSON.stringify(updated) });
        currentProjectRef.current = saved;
        setCurrentProject(saved);
        setSaveState({ kind: 'clean', at: new Date() });
        ok = true;
      }
    } catch (error: any) {
      if (error instanceof TypeError) {
        saveLocalProject(updated);
        setSaveState({ kind: 'local', at: new Date() });
        dirtyRef.current = true;
      } else {
        console.error('Failed to save screenplay:', error);
        setSaveState({ kind: 'error', message: error?.message || 'unknown error' });
        dirtyRef.current = true;
      }
    } finally {
      savingRef.current = false;
    }
    if (dirtyRef.current && ok) markDirty();
    return ok;
  }, [markDirty]);

  // Native host: expose the bridge once; the host loads the document through it.
  useEffect(() => {
    if (!HOSTED) return;
    installHostApi({
      getView: () => editorViewRef.current,
      setView: name => {
        if ((VIEW_KEYS as string[]).includes(name)) setActiveView(name as ViewType);
      },
      undo: () => historyCommand('undo'),
      redo: () => historyCommand('redo'),
      toggleFocus: () => {
        setActiveView('editor');
        setFocusMode(f => !f);
      },
      getDocument: hostDocument,
      loadDocument: (doc: HostDocument) => {
        const now = new Date().toISOString();
        const project: ScreenplayProject = { id: `host-${Date.now()}`, title: doc.title || 'Untitled', author: doc.author, contact: doc.contact, content: doc.content, beats: doc.beats, room: doc.room ?? null, createdAt: now, updatedAt: now };
        currentProjectRef.current = project;
        setCurrentProject(project);
        contentRef.current = project.content;
        beatsRef.current = project.beats ?? null;
        setBeats(project.beats ?? null);
        roomRef.current = project.room ?? null;
        setRoom(project.room ?? null);
        dirtyRef.current = false;
        setSaveState({ kind: 'clean' });
        setEditorState(null);
        editorViewRef.current = null;
        setShowProjectManager(false);
        setActiveView('editor');
        setHostGeneration(g => g + 1);
      },
      setTheme: (name: string) => {
        document.documentElement.dataset.theme = name;
        setTheme(name);
      },
      exportAs: format => {
        const project = currentProjectRef.current;
        if (!project) return;
        const current = { ...project, content: contentRef.current || project.content };
        if (format === 'pdf') void exportToPDF(current);
        else if (format === 'fdx') exportToFDX(current);
        else if (format === 'fountain') exportToFountain(current);
        else exportToText(current);
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
    roomRef.current = project.room ?? null;
    setRoom(project.room ?? null);
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

  const handleRoomChange = (data: RoomData) => {
    roomRef.current = data;
    setRoom(data);
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

  const toggleScenes = () => setShowScenes(v => (writePref('ui.scenes', String(!v)), !v));
  const toggleInspector = () => setShowInspector(v => (writePref('ui.inspector', String(!v)), !v));

  const openFind = () => {
    const view = editorViewRef.current;
    if (!view) return;
    setActiveView('editor');
    openSearch(view.state, view.dispatch);
  };

  /**
   * Undo/redo from the native Edit menu. The script's own history when the
   * page is the target; the browser's when a plain field (synopsis, search)
   * has focus.
   */
  const historyCommand = (which: 'undo' | 'redo') => {
    const active = document.activeElement as HTMLElement | null;
    const view = editorViewRef.current;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      document.execCommand(which);
      return;
    }
    if (!view) return;
    (which === 'undo' ? undo : redo)(view.state, view.dispatch);
    view.focus();
  };

  // Global keys: save, focus mode.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (autosaveTimer.current) {
          clearTimeout(autosaveTimer.current);
          autosaveTimer.current = null;
        }
        void save().then(saved => {
          if (HOSTED && saved) postToHost({ type: 'save' });
        });
      } else if (mod && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFocusMode(f => !f);
      } else if (mod && event.altKey && !event.shiftKey && event.code.startsWith('Digit')) {
        const index = Number(event.code.slice(5)) - 1;
        if (VIEW_KEYS[index]) {
          event.preventDefault();
          setActiveView(VIEW_KEYS[index]);
        }
      } else if (event.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [save, focusMode]);

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

  if (showProjectManager) return <ProjectManager onProjectSelect={handleProjectSelect} />;
  // The title sits over the page, not in the middle of the toolbar's spare
  // room: measure where the page is and slide the title to its centre, kept
  // within the space the toolbar buttons leave free.
  const titleSlotRef = useRef<HTMLDivElement>(null);
  const titleInnerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = titleSlotRef.current;
    const inner = titleInnerRef.current;
    if (!slot || !inner) return;
    const place = () => {
      const page = document.querySelector('.view.active .prosemirror-editor') || document.querySelector('.view.active');
      if (!page) return;
      const target = page.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      if (!target.width || !slotRect.width) return;
      const wanted = target.left + target.width / 2 - inner.offsetWidth / 2 - slotRect.left;
      inner.style.marginLeft = `${Math.round(Math.max(0, Math.min(wanted, slotRect.width - inner.offsetWidth)))}px`;
    };
    place();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    observer?.observe(slot);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [activeView, showScenes, showInspector, focusMode, currentProject?.title, describeSave(saveState).text, editorState === null]);

  // Focus mode is for writing: leaving the Script view leaves it too.
  useEffect(() => {
    if (focusMode && activeView !== 'editor') setFocusMode(false);
  }, [activeView, focusMode]);

  if (HOSTED && !currentProject) return <div className="app" />;

  const saveInfo = describeSave(saveState);

  return (
    <div className={`app${HOSTED ? ' hosted' : ''}${focusMode ? ' focus-mode' : ''}`}>
      <header className="toolbar">
        <div className="toolbar-group">
          <button className={`ui-button icon${showScenes ? ' active' : ''}`} onClick={toggleScenes} title="Scenes panel">
            <SidebarIcon />
          </button>
        </div>
        <nav className="toolbar-group tabs" aria-label="Views">
          {tabs.map(tab => (
            <button key={tab.id} className={`ui-button${activeView === tab.id ? ' active' : ''}`} onClick={() => setActiveView(tab.id)} title={`${tab.label}  ⌥⌘${VIEW_KEYS.indexOf(tab.id) + 1}`}>
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="toolbar-title" ref={titleSlotRef}>
          <div className="toolbar-title-inner" ref={titleInnerRef}>
            <span className="toolbar-title-text">{currentProject?.title || 'Untitled'}</span>
            <span className={`save-status ${saveInfo.className}`}>{saveInfo.text}</span>
          </div>
        </div>
        <div className="toolbar-group">
          <button className="ui-button icon" onClick={openFind} title="Find (⌘F)">
            <SearchIcon />
          </button>
          <button className={`ui-button icon${focusMode ? ' active' : ''}`} onClick={() => setFocusMode(f => !f)} disabled={activeView !== 'editor'} title="Focus mode: just the page (⇧⌘F, Esc to leave)">
            <FocusIcon />
          </button>
          {!HOSTED && (
            <label className="ui-button icon theme-select" title="Theme">
              <PaletteIcon />
              <select value={theme} onChange={e => setTheme(e.target.value)} aria-label="Theme">
                {THEMES.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="ui-button icon" onClick={() => setShowExportDialog(true)} disabled={!currentProject} title="Export">
            <ExportIcon />
          </button>
          {!HOSTED && (
            <button className="ui-button icon" onClick={() => void openProjects()} title="Scripts">
              <FolderIcon />
            </button>
          )}
          <button className={`ui-button icon${showInspector ? ' active' : ''}`} onClick={toggleInspector} title="Inspector">
            <InspectorIcon />
          </button>
        </div>
      </header>

      <main className="views">
        {/* The editor stays mounted on every tab so the outline and beat board can act on the live script. */}
        <div className={`view${activeView === 'editor' ? ' active' : ''}`}>
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
              showScenes={showScenes}
              showInspector={showInspector}
              focusMode={focusMode}
            />
          )}
        </div>
        <div className={`view${activeView === 'board' ? ' active' : ''}`}>
          {activeView === 'board' && currentProject && editorState && (
            <BeatBoard data={beats} onChange={handleBeatsChange} view={editorViewRef.current} state={editorState} onOpenScene={openScene} />
          )}
        </div>
        <div className={`view${activeView === 'outline' ? ' active' : ''}`}>
          {activeView === 'outline' && currentProject && editorState && <OutlineView view={editorViewRef.current} state={editorState} onOpenScene={openScene} />}
        </div>
        <div className={`view${activeView === 'room' ? ' active' : ''}`}>
          {activeView === 'room' && currentProject && editorState && (
            <RoomView
              view={editorViewRef.current}
              state={editorState}
              title={currentProject.title}
              data={room}
              onChange={handleRoomChange}
              beats={beats}
              onBeatsChange={handleBeatsChange}
              onOpenScene={openScene}
            />
          )}
        </div>
        <div className={`view${activeView === 'reports' ? ' active' : ''}`}>
          {activeView === 'reports' && currentProject && editorState && <ReportsView state={editorState} onOpenScene={openScene} />}
        </div>
      </main>

      {focusMode && (
        <button className="focus-exit" onClick={() => setFocusMode(false)} title="Leave focus mode (Esc or ⇧⌘F)">
          <FocusIcon />
          <span>Exit focus</span>
        </button>
      )}
      {showExportDialog && currentProject && (
        <ExportDialog project={{ ...currentProject, content: contentRef.current || currentProject.content }} onClose={() => setShowExportDialog(false)} />
      )}
    </div>
  );
};

export default App;
