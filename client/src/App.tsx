import React, { useState, useEffect, useRef } from 'react';
import BeatBoard from './components/BeatBoard';
import Editor from './components/Editor';
import ProseMirrorEditor from './components/editor-v2/ProseMirrorEditor';
import OutlineEditor from './components/OutlineEditor';
import { ProjectManager, ScreenplayProject } from './components/ProjectManager';
import { ExportDialog } from './components/ExportDialog';
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

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('editor');
  const [currentProject, setCurrentProject] = useState<ScreenplayProject | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [beatsData, setBeatsData] = useState<any>(null);
  const [outlineData, setOutlineData] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [useProseMirror, setUseProseMirror] = useState(true); // Toggle for testing
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  const handleProjectSelect = (project: ScreenplayProject) => {
    setCurrentProject(project);
    setEditorContent(project.content);
    setBeatsData((project as any).beats || null);
    setOutlineData((project as any).outline || null);
    setShowProjectManager(false);
    setHasUnsavedChanges(false);
  };
  
  const handleContentChange = (content: string) => {
    setEditorContent(content);
    setHasUnsavedChanges(true);
  };

  const handleBeatsChange = (data: any) => {
    setBeatsData(data);
    setHasUnsavedChanges(true);
  };

  const handleOutlineChange = (data: any) => {
    setOutlineData(data);
    setHasUnsavedChanges(true);
  };

  const handleNewProject = () => {
    setShowProjectManager(false);
  };

  const handleTitlePageUpdate = async (data: { title: string; author?: string; contact?: string }) => {
    if (!currentProject) return;
    
    const updatedProject = {
      ...currentProject,
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    setCurrentProject(updatedProject);
    
    try {
      await fetch(`http://localhost:5001/screenplays/${currentProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProject)
      });
    } catch (error) {
      console.error('Failed to update screenplay metadata:', error);
      
      // Fallback to localStorage
      const savedProjects = localStorage.getItem('screenplayProjects');
      const projects = savedProjects ? JSON.parse(savedProjects) : [];
      const projectIndex = projects.findIndex((p: ScreenplayProject) => p.id === currentProject.id);
      
      if (projectIndex >= 0) {
        projects[projectIndex] = updatedProject;
        localStorage.setItem('screenplayProjects', JSON.stringify(projects));
      }
    }
  };

  const handleSave = async () => {
    if (!currentProject) return;
    
    // Update project with latest content, beats, and outline
    const updatedProject = {
      ...currentProject,
      content: editorContent || currentProject.content,
      beats: beatsData,
      outline: outlineData,
      updatedAt: new Date().toISOString()
    };
    
    try {
      const response = await fetch(`http://localhost:5001/screenplays/${currentProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProject)
      });
      
      if (response.ok) {
        const savedProject = await response.json();
        setCurrentProject(savedProject);
        setHasUnsavedChanges(false);
        
        // Show save confirmation
        const saveButton = document.querySelector('.action-button[title="Save"]');
        if (saveButton) {
          saveButton.textContent = '✅';
          setTimeout(() => {
            saveButton.textContent = '💾';
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Failed to save screenplay:', error);
      
      // Fallback to localStorage
      const savedProjects = localStorage.getItem('screenplayProjects');
      const projects = savedProjects ? JSON.parse(savedProjects) : [];
      const projectIndex = projects.findIndex((p: ScreenplayProject) => p.id === currentProject.id);
      
      if (projectIndex >= 0) {
        projects[projectIndex] = updatedProject;
      } else {
        projects.push(updatedProject);
      }
      
      localStorage.setItem('screenplayProjects', JSON.stringify(projects));
      setCurrentProject(updatedProject);
      setHasUnsavedChanges(false);
      
      // Show save with warning
      const saveButton = document.querySelector('.action-button[title="Save"]');
      if (saveButton) {
        saveButton.textContent = '⚠️';
        setTimeout(() => {
          saveButton.textContent = '💾';
        }, 2000);
      }
    }
  };

  // Auto-save functionality
  useEffect(() => {
    if (hasUnsavedChanges && currentProject) {
      // Clear existing timer
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      
      // Set new timer for auto-save
      autoSaveTimer.current = setTimeout(() => {
        handleSave();
      }, 5000); // Auto-save after 5 seconds of inactivity
    }
    
    // Cleanup timer on unmount or when deps change
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [hasUnsavedChanges, editorContent, beatsData, outlineData, currentProject]);

  if (showProjectManager) {
    return (
      <ProjectManager 
        onProjectSelect={handleProjectSelect}
        onNewProject={handleNewProject}
      />
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title">
          <h1>AI Screenwriting Tool</h1>
          <span className="app-subtitle">Professional Script Editor</span>
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
          <button 
            className="action-button" 
            title="Toggle Editor" 
            onClick={() => setUseProseMirror(!useProseMirror)}
            style={{ fontSize: '0.8rem' }}
          >
            {useProseMirror ? 'PM' : 'CM'}
          </button>
          <button className="action-button" title="Projects" onClick={() => setShowProjectManager(true)}>📁</button>
          <button 
            className={`action-button ${hasUnsavedChanges ? 'unsaved' : ''}`} 
            title="Save" 
            onClick={handleSave}
          >
            💾
          </button>
          <button className="action-button" title="Export" onClick={() => setShowExportDialog(true)} disabled={!currentProject}>📤</button>
          <button className="action-button" title="Settings">⚙️</button>
        </div>
      </header>
      
      <main className="app-main">
        <div className={`view-container ${activeView === 'editor' ? 'active' : ''}`}>
          {activeView === 'editor' && currentProject && (
            useProseMirror ? (
              <ProseMirrorEditor
                key={currentProject.id + '-pm'}
                initialContent={currentProject.content}
                onContentChange={handleContentChange}
                projectTitle={currentProject.title}
                projectAuthor={currentProject.author}
                projectContact={currentProject.contact}
              />
            ) : (
              <Editor 
                key={currentProject.id}
                initialText={currentProject.content} 
                onContentChange={handleContentChange}
                projectTitle={currentProject.title}
                projectAuthor={currentProject.author}
                projectContact={currentProject.contact}
                onTitlePageUpdate={handleTitlePageUpdate}
              />
            )
          )}
        </div>
        <div className={`view-container ${activeView === 'board' ? 'active' : ''}`}>
          {activeView === 'board' && currentProject && (
            <BeatBoard 
              screenplayId={currentProject.id}
              onDataChange={handleBeatsChange}
            />
          )}
        </div>
        <div className={`view-container ${activeView === 'outline' ? 'active' : ''}`}>
          {activeView === 'outline' && currentProject && (
            <OutlineEditor 
              screenplayId={currentProject.id}
              onDataChange={handleOutlineChange}
            />
          )}
        </div>
      </main>
      
      {showExportDialog && currentProject && (
        <ExportDialog 
          project={{
            ...currentProject,
            content: editorContent || currentProject.content
          }}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </div>
  );
};

export default App;