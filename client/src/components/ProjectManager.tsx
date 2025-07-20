import React, { useState, useEffect } from 'react';
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
}

interface ProjectManagerProps {
  onProjectSelect: (project: ScreenplayProject) => void;
  onNewProject: () => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ onProjectSelect, onNewProject }) => {
  const [projects, setProjects] = useState<ScreenplayProject[]>([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectAuthor, setNewProjectAuthor] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:5001/screenplays');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to load screenplays:', error);
      // Fallback to localStorage if API fails
      const savedProjects = localStorage.getItem('screenplayProjects');
      if (savedProjects) {
        setProjects(JSON.parse(savedProjects));
      }
    }
  };

  const createNewProject = async () => {
    if (!newProjectTitle.trim()) return;

    const newProject: Omit<ScreenplayProject, 'id' | 'createdAt' | 'updatedAt'> = {
      title: newProjectTitle,
      author: newProjectAuthor,
      content: '',
      format: 'screenplay'
    };

    try {
      const response = await fetch('http://localhost:5001/screenplays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject)
      });
      
      if (response.ok) {
        const savedProject = await response.json();
        setProjects([...projects, savedProject]);
        setShowNewDialog(false);
        setNewProjectTitle('');
        setNewProjectAuthor('');
        onProjectSelect(savedProject);
      }
    } catch (error) {
      console.error('Failed to create screenplay:', error);
      // Fallback to localStorage
      const updatedProjects = [...projects, newProject];
      setProjects(updatedProjects);
      localStorage.setItem('screenplayProjects', JSON.stringify(updatedProjects));
      setShowNewDialog(false);
      setNewProjectTitle('');
      setNewProjectAuthor('');
      onProjectSelect(newProject);
    }
  };

  const deleteProject = async (projectId: string) => {
    if (confirm('Are you sure you want to delete this screenplay?')) {
      try {
        const response = await fetch(`http://localhost:5001/screenplays/${projectId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          const updatedProjects = projects.filter(p => p.id !== projectId);
          setProjects(updatedProjects);
        }
      } catch (error) {
        console.error('Failed to delete screenplay:', error);
        // Fallback to localStorage
        const updatedProjects = projects.filter(p => p.id !== projectId);
        setProjects(updatedProjects);
        localStorage.setItem('screenplayProjects', JSON.stringify(updatedProjects));
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Unknown date';
    }
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="project-manager">
      <div className="project-header">
        <h1>AI Screenwriting Tool</h1>
        <p className="tagline">Professional screenplay writing with AI assistance</p>
      </div>

      <div className="project-actions">
        <button 
          className="btn-primary"
          onClick={() => setShowNewDialog(true)}
        >
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
                  <h3>{project.title}</h3>
                  {project.author && <p className="author">by {project.author}</p>}
                  <p className="date">Last updated: {formatDate(project.updatedAt)}</p>
                </div>
                <div className="project-actions">
                  <button 
                    className="btn-secondary"
                    onClick={() => onProjectSelect(project)}
                  >
                    Open
                  </button>
                  <button 
                    className="btn-danger"
                    onClick={() => deleteProject(project.id)}
                  >
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
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="Enter screenplay title"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Author</label>
              <input
                type="text"
                value={newProjectAuthor}
                onChange={(e) => setNewProjectAuthor(e.target.value)}
                placeholder="Enter author name"
              />
            </div>
            <div className="dialog-actions">
              <button 
                className="btn-secondary"
                onClick={() => setShowNewDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={createNewProject}
                disabled={!newProjectTitle.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};