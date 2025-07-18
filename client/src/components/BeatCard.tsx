import React from 'react';

export interface Beat {
  id: string;
  title: string;
  description: string;
  color: string;
  connections?: string[]; // placeholder for flow lines
}

interface BeatCardProps {
  beat: Beat;
  onEdit: () => void;
  onDelete: () => void;
}

const cardStyle: React.CSSProperties = {
  padding: '8px',
  borderRadius: '4px',
  marginBottom: '8px',
  color: '#000',
};

export const BeatCard: React.FC<BeatCardProps> = ({ beat, onEdit, onDelete }) => {
  return (
    <div style={{ ...cardStyle, background: beat.color }}>
      <strong>{beat.title}</strong>
      <p>{beat.description}</p>
      <div>
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
};

export default BeatCard;
