import React, { useEffect } from 'react';
import { ScreenplayProject } from './ProjectManager';
import { exportToPDF, exportToFDX, exportToText, exportToFountain } from '../utils/exporters';
import './ExportDialog.css';

interface ExportDialogProps {
  project: ScreenplayProject;
  onClose: () => void;
}

type Format = 'pdf' | 'fdx' | 'fountain' | 'txt';

const FORMATS: { id: Format; badge: string; name: string; note: string }[] = [
  { id: 'pdf', badge: 'PDF', name: 'PDF', note: 'Paginated exactly as on screen. For sharing and printing.' },
  { id: 'fdx', badge: 'FDX', name: 'Final Draft', note: 'Opens in Final Draft with scene colours and synopses intact.' },
  { id: 'fountain', badge: 'FTN', name: 'Fountain', note: 'Plain-text screenplay read by Highland, Slugline, Beat and others.' },
  { id: 'txt', badge: 'TXT', name: 'Plain text', note: 'The script as text, one element per paragraph.' }
];

export const ExportDialog: React.FC<ExportDialogProps> = ({ project, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleExport = (format: Format) => {
    if (format === 'pdf') exportToPDF(project);
    else if (format === 'fdx') exportToFDX(project);
    else if (format === 'fountain') exportToFountain(project);
    else exportToText(project);
    onClose();
  };

  return (
    <div className="ui-overlay" onClick={onClose}>
      <div className="ui-sheet export-dialog" role="dialog" aria-label="Export" onClick={e => e.stopPropagation()}>
        <div className="export-head">
          <h2>Export</h2>
          <p>{project.title}</p>
        </div>
        <div className="export-options">
          {FORMATS.map(f => (
            <button key={f.id} className="export-option" onClick={() => handleExport(f.id)} autoFocus={f.id === 'pdf'}>
              <span className="export-badge">{f.badge}</span>
              <span className="export-info">
                <span className="export-name">{f.name}</span>
                <span className="export-note">{f.note}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="export-actions">
          <button className="ui-button outlined" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
