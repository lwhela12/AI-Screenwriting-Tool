import React, { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import './OutlineEditor.css';

interface Card {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface Lane {
  id: string;
  title: string;
  cardIds: string[];
}

interface OutlineData {
  cards: Record<string, Card>;
  lanes: Lane[];
}

const STORAGE_KEY = 'outlineData';

const getInitialData = (): OutlineData => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as OutlineData;
    } catch {
      /* ignore */
    }
  }
  const firstCard: Card = {
    id: 'card-1',
    title: 'Example Card',
    description: 'Short description',
    color: '#cfe2ff',
  };
  return {
    cards: { 'card-1': firstCard },
    lanes: [{ id: 'lane-1', title: 'Act I', cardIds: ['card-1'] }],
  };
};

const OutlineCard: React.FC<{
  card: Card;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ card, onEdit, onDelete }) => (
  <div className="outline-card" style={{ background: card.color }}>
    <strong>{card.title}</strong>
    <p>{card.description}</p>
    <div>
      <button onClick={onEdit}>Edit</button>
      <button onClick={onDelete}>Delete</button>
    </div>
  </div>
);

export const OutlineEditor: React.FC = () => {
  const [data, setData] = useState<OutlineData>(getInitialData);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setData((prev) => {
      const newLanes = [...prev.lanes];
      const sourceLane = newLanes.find((l) => l.id === source.droppableId)!;
      const destLane = newLanes.find((l) => l.id === destination.droppableId)!;
      sourceLane.cardIds.splice(source.index, 1);
      destLane.cardIds.splice(destination.index, 0, draggableId);
      return { ...prev, lanes: newLanes };
    });
  };

  const addLane = () => {
    const title = window.prompt('Lane title');
    if (!title) return;
    setData((prev) => ({
      ...prev,
      lanes: [...prev.lanes, { id: `lane-${Date.now()}`, title, cardIds: [] }],
    }));
  };

  const editLane = (id: string) => {
    const lane = data.lanes.find((l) => l.id === id);
    if (!lane) return;
    const title = window.prompt('Lane title', lane.title);
    if (!title) return;
    setData((prev) => ({
      ...prev,
      lanes: prev.lanes.map((l) => (l.id === id ? { ...l, title } : l)),
    }));
  };

  const deleteLane = (id: string) => {
    if (!window.confirm('Delete lane?')) return;
    setData((prev) => {
      const lane = prev.lanes.find((l) => l.id === id);
      if (!lane) return prev;
      const newCards = { ...prev.cards };
      lane.cardIds.forEach((cid) => delete newCards[cid]);
      return {
        cards: newCards,
        lanes: prev.lanes.filter((l) => l.id !== id),
      };
    });
  };

  const addCard = (laneId: string) => {
    const title = window.prompt('Card title');
    if (!title) return;
    const description = window.prompt('Description') || '';
    const color = window.prompt('Color (CSS value)', '#cfe2ff') || '#cfe2ff';
    const id = `card-${Date.now()}`;
    const card: Card = { id, title, description, color };
    setData((prev) => {
      const newLanes = prev.lanes.map((l) => (l.id === laneId ? { ...l, cardIds: [...l.cardIds, id] } : l));
      return {
        cards: { ...prev.cards, [id]: card },
        lanes: newLanes,
      };
    });
  };

  const editCard = (id: string) => {
    const card = data.cards[id];
    if (!card) return;
    const title = window.prompt('Card title', card.title);
    if (!title) return;
    const description = window.prompt('Description', card.description) || '';
    const color = window.prompt('Color', card.color) || card.color;
    setData((prev) => ({
      ...prev,
      cards: { ...prev.cards, [id]: { ...card, title, description, color } },
    }));
  };

  const deleteCard = (id: string, laneId: string) => {
    if (!window.confirm('Delete card?')) return;
    setData((prev) => {
      const newCards = { ...prev.cards };
      delete newCards[id];
      const newLanes = prev.lanes.map((l) =>
        l.id === laneId ? { ...l, cardIds: l.cardIds.filter((cid) => cid !== id) } : l,
      );
      return { cards: newCards, lanes: newLanes };
    });
  };

  return (
    <div className="outline-editor">
      <div className="outline-toolbar">
        <button onClick={addLane}>Add Lane</button>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="outline-lanes">
          {data.lanes.map((lane) => (
            <Droppable droppableId={lane.id} key={lane.id}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="outline-lane">
                  <div className="lane-header">
                    <h3 onClick={() => editLane(lane.id)}>{lane.title}</h3>
                    <div>
                      <button onClick={() => addCard(lane.id)}>Add Card</button>
                      <button onClick={() => deleteLane(lane.id)}>Delete Lane</button>
                    </div>
                  </div>
                  {lane.cardIds.map((cid, index) => {
                    const card = data.cards[cid];
                    if (!card) return null;
                    return (
                      <Draggable draggableId={card.id} index={index} key={card.id}>
                        {(prov) => (
                          <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                            <OutlineCard
                              card={card}
                              onEdit={() => editCard(card.id)}
                              onDelete={() => deleteCard(card.id, lane.id)}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  <div className="structure-line" />
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default OutlineEditor;
