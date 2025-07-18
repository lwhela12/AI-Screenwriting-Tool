import React, { useState } from 'react';
import BeatBoard from './components/BeatBoard';
import Editor from './components/Editor';
import OutlineEditor from './components/OutlineEditor';

export const App: React.FC = () => {
  const [view, setView] = useState<'board' | 'outline' | 'editor'>('board');

  return (
    <div>
      <div style={{ padding: '8px', background: '#e0e0e0', display: 'flex', gap: '8px' }}>
        <button onClick={() => setView('board')}>Beat Board</button>
        <button onClick={() => setView('outline')}>Outline Editor</button>
        <button onClick={() => setView('editor')}>Editor</button>
      </div>
      {view === 'board' && <BeatBoard />}
      {view === 'outline' && <OutlineEditor />}
      {view === 'editor' && <Editor />}
    </div>
  );
};

export default App;
