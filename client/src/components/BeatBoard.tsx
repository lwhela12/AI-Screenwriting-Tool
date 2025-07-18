import React, { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import "./BeatBoard.css";
import BeatCard, { Beat } from './BeatCard';

interface Lane {
  id: string;
  title: string;
  beatIds: string[];
}

interface BoardData {
  beats: Record<string, Beat>;
  lanes: Lane[];
}

const getInitialData = (): BoardData => {
  const stored = localStorage.getItem('beat-board');
  if (stored) {
    try {
      return JSON.parse(stored) as BoardData;
    } catch {
      /* ignore */
    }
  }
  const firstBeat: Beat = {
    id: 'beat-1',
    title: 'Example Beat',
    description: 'Short description',
    color: '#ffd966',
  };
  return {
    beats: { 'beat-1': firstBeat },
    lanes: [{ id: 'lane-1', title: 'Ideas', beatIds: ['beat-1'] }],
  };
};

export const BeatBoard: React.FC = () => {
  const [data, setData] = useState<BoardData>(getInitialData);

  useEffect(() => {
    localStorage.setItem('beat-board', JSON.stringify(data));
  }, [data]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }
    setData((prev) => {
      const newLanes = [...prev.lanes];
      const sourceLane = newLanes.find((l) => l.id === source.droppableId)!;
      const destLane = newLanes.find((l) => l.id === destination.droppableId)!;
      sourceLane.beatIds.splice(source.index, 1);
      destLane.beatIds.splice(destination.index, 0, draggableId);
      return { ...prev, lanes: newLanes };
    });
  };

  const addLane = () => {
    const title = window.prompt('Lane title');
    if (!title) return;
    setData((prev) => ({
      ...prev,
      lanes: [...prev.lanes, { id: `lane-${Date.now()}`, title, beatIds: [] }],
    }));
  };

  const addBeat = (laneId: string) => {
    const title = window.prompt('Beat title');
    if (!title) return;
    const description = window.prompt('Description') || '';
    const color = window.prompt('Color (CSS value)', '#ffd966') || '#ffd966';
    const id = `beat-${Date.now()}`;
    const beat: Beat = { id, title, description, color };
    setData((prev) => {
      const newLanes = prev.lanes.map((l) =>
        l.id === laneId ? { ...l, beatIds: [...l.beatIds, id] } : l,
      );
      return {
        beats: { ...prev.beats, [id]: beat },
        lanes: newLanes,
      };
    });
  };

  const editBeat = (id: string) => {
    const beat = data.beats[id];
    const title = window.prompt('Beat title', beat.title);
    if (!title) return;
    const description = window.prompt('Description', beat.description) || '';
    const color = window.prompt('Color', beat.color) || beat.color;
    setData((prev) => ({
      ...prev,
      beats: { ...prev.beats, [id]: { ...beat, title, description, color } },
    }));
  };

  const deleteBeat = (id: string, laneId: string) => {
    if (!window.confirm('Delete beat?')) return;
    setData((prev) => {
      const newBeats = { ...prev.beats };
      delete newBeats[id];
      const newLanes = prev.lanes.map((l) =>
        l.id === laneId ? { ...l, beatIds: l.beatIds.filter((b) => b !== id) } : l,
      );
      return { beats: newBeats, lanes: newLanes };
    });
  };

  return (
    <div className="beat-board">
      <div style={{ padding: '8px' }}>
        <button onClick={addLane}>Add Lane</button>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="lanes">
          {data.lanes.map((lane) => (
            <Droppable droppableId={lane.id} key={lane.id}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="lane"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>{lane.title}</h3>
                    <button onClick={() => addBeat(lane.id)}>Add Beat</button>
                  </div>
                  {lane.beatIds.map((beatId, index) => {
                    const beat = data.beats[beatId];
                    if (!beat) return null;
                    return (
                      <Draggable draggableId={beat.id} index={index} key={beat.id}>
                        {(prov) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                          >
                            <BeatCard
                              beat={beat}
                              onEdit={() => editBeat(beat.id)}
                              onDelete={() => deleteBeat(beat.id, lane.id)}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default BeatBoard;
