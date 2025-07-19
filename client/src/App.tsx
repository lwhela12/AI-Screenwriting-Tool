import React, { useState } from 'react';
import BeatBoard from './components/BeatBoard';
import Editor from './components/Editor';
import OutlineEditor from './components/OutlineEditor';
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
          <button className="action-button" title="Save">💾</button>
          <button className="action-button" title="Export">📤</button>
          <button className="action-button" title="Settings">⚙️</button>
        </div>
      </header>
      
      <main className="app-main">
        <div className={`view-container ${activeView === 'editor' ? 'active' : ''}`}>
          {activeView === 'editor' && <Editor />}
        </div>
        <div className={`view-container ${activeView === 'board' ? 'active' : ''}`}>
          {activeView === 'board' && <BeatBoard />}
        </div>
        <div className={`view-container ${activeView === 'outline' ? 'active' : ''}`}>
          {activeView === 'outline' && <OutlineEditor />}
        </div>
      </main>
    </div>
  );
};

export default App;