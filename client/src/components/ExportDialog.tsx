import React from 'react';
import { ScreenplayProject } from './ProjectManager';
import { exportToPDF, exportToFDX, exportToText, exportToFountain } from '../utils/exporters';
import './ExportDialog.css';

interface ExportDialogProps {
  project: ScreenplayProject;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ project, onClose }) => {
  const handleExport = (format: 'pdf' | 'fdx' | 'fountain' | 'txt') => {
    switch (format) {
      case 'pdf':
        exportToPDF(project);
        break;
      case 'fdx':
        exportToFDX(project);
        break;
      case 'fountain':
        exportToFountain(project);
        break;
      case 'txt':
        exportToText(project);
        break;
    }
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={e => e.stopPropagation()}>
        <h2>Export Screenplay</h2>
        <p className="export-title">"{project.title}"</p>
        
        <div className="export-options">
          <button 
            className="export-option"
            onClick={() => handleExport('pdf')}
          >
            <div className="export-icon">📄</div>
            <div className="export-info">
              <h3>PDF</h3>
              <p>Industry-standard format for sharing and printing</p>
            </div>
          </button>
          
          <button 
            className="export-option"
            onClick={() => handleExport('fdx')}
          >
            <div className="export-icon">📝</div>
            <div className="export-info">
              <h3>Final Draft (.fdx)</h3>
              <p>Compatible with Final Draft and other screenwriting software</p>
            </div>
          </button>
          
          <button className="export-option" onClick={() => handleExport('fountain')}>
            <div className="export-icon">⛲</div>
            <div className="export-info">
              <h3>Fountain (.fountain)</h3>
              <p>Plain-text screenplay format read by Highland, Slugline, Beat and others</p>
            </div>
          </button>

          <button 
            className="export-option"
            onClick={() => handleExport('txt')}
          >
            <div className="export-icon">📃</div>
            <div className="export-info">
              <h3>Plain Text</h3>
              <p>Simple text format for basic editing</p>
            </div>
          </button>
        </div>
        
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};