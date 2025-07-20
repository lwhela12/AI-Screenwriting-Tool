import React, { useState, useEffect } from 'react';
import './TitlePage.css';

interface TitlePageProps {
  title: string;
  author?: string;
  contact?: string;
  onUpdate?: (data: { title: string; author?: string; contact?: string }) => void;
  onClose: () => void;
}

export const TitlePage: React.FC<TitlePageProps> = ({ 
  title: initialTitle, 
  author: initialAuthor, 
  contact: initialContact,
  onUpdate,
  onClose 
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor || '');
  const [contact, setContact] = useState(initialContact || '');
  const [editMode, setEditMode] = useState(false);

  const handleSave = () => {
    if (onUpdate) {
      onUpdate({ title, author, contact });
    }
    setEditMode(false);
  };

  const handleCancel = () => {
    setTitle(initialTitle);
    setAuthor(initialAuthor || '');
    setContact(initialContact || '');
    setEditMode(false);
  };

  return (
    <div className="title-page-container">
      <div className="title-page-header">
        <h2>Title Page</h2>
        <div className="title-page-actions">
          {!editMode ? (
            <>
              <button className="btn-edit" onClick={() => setEditMode(true)}>
                Edit
              </button>
              <button className="btn-close" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button className="btn-save" onClick={handleSave}>
                Save
              </button>
              <button className="btn-cancel" onClick={handleCancel}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="title-page-preview">
        <div className="title-page-paper">
          {editMode ? (
            <div className="title-page-edit-form">
              <div className="form-group">
                <label>Title:</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="SCREENPLAY TITLE"
                />
              </div>
              <div className="form-group">
                <label>Author:</label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your Name"
                />
              </div>
              <div className="form-group">
                <label>Contact Info:</label>
                <textarea
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Your Name&#10;Address&#10;City, State ZIP&#10;Phone&#10;Email&#10;WGA Registration # (optional)"
                  rows={6}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="title-page-content">
                <div className="title-section">
                  <h1 className="screenplay-title">{title.toUpperCase()}</h1>
                  {author && (
                    <>
                      <p className="byline">Written by</p>
                      <p className="author-name">{author}</p>
                    </>
                  )}
                </div>
              </div>
              {contact && (
                <div className="contact-info">
                  {contact.split('\n').map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};