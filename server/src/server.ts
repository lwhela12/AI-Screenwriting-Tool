import 'reflect-metadata';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { AppDataSource } from './database/dataSource';
import { Screenplay } from './entities/Screenplay';
import * as dotenv from 'dotenv';

dotenv.config();

interface Beat {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface BeatLane {
  id: string;
  title: string;
  beatIds: string[];
}

interface BeatsData {
  beats: Record<string, Beat>;
  lanes: BeatLane[];
}

interface Card {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface OutlineLane {
  id: string;
  title: string;
  cardIds: string[];
}

interface OutlineData {
  cards: Record<string, Card>;
  lanes: OutlineLane[];
}

// Using the Screenplay entity from TypeORM instead

interface Project {
  id: number;
  name: string;
}

const app = express();
const port = process.env.PORT || 5001;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const projects: Project[] = [{ id: 1, name: 'Default Project' }];
const beatsStore: Record<number, BeatsData> = {
  1: { beats: {}, lanes: [] },
};
const outlineStore: Record<number, OutlineData> = {
  1: { cards: {}, lanes: [] },
};
// Initialize TypeORM connection
let screenplayRepository: any;

AppDataSource.initialize()
  .then(() => {
    console.log('Database connection initialized');
    screenplayRepository = AppDataSource.getRepository(Screenplay);
  })
  .catch((error) => {
    console.error('Error during database initialization:', error);
  });

app.get('/status', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/projects', (_req, res) => {
  res.json(projects);
});

app.post('/projects', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  const id = Date.now();
  const project: Project = { id, name };
  projects.push(project);
  beatsStore[id] = { beats: {}, lanes: [] };
  outlineStore[id] = { cards: {}, lanes: [] };
  res.status(201).json(project);
});

app.get('/projects/:projectId/beats', (req, res) => {
  const id = Number(req.params.projectId);
  const data = beatsStore[id];
  if (!data) {
    return res.status(404).json({ error: 'project not found' });
  }
  res.json(data);
});

app.put('/projects/:projectId/beats', (req, res) => {
  const id = Number(req.params.projectId);
  const data = req.body as BeatsData;
  beatsStore[id] = data;
  res.json({ status: 'saved' });
});

app.get('/projects/:projectId/outlines', (req, res) => {
  const id = Number(req.params.projectId);
  const data = outlineStore[id];
  if (!data) {
    return res.status(404).json({ error: 'project not found' });
  }
  res.json(data);
});

app.put('/projects/:projectId/outlines', (req, res) => {
  const id = Number(req.params.projectId);
  const data = req.body as OutlineData;
  outlineStore[id] = data;
  res.json({ status: 'saved' });
});

// Screenplay endpoints
app.get('/screenplays', async (_req, res) => {
  try {
    if (!screenplayRepository) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    const screenplays = await screenplayRepository.find({
      order: { updatedAt: 'DESC' }
    });
    res.json(screenplays);
  } catch (error) {
    console.error('Error fetching screenplays:', error);
    res.status(500).json({ error: 'Failed to fetch screenplays' });
  }
});

app.get('/screenplays/:id', async (req, res) => {
  try {
    if (!screenplayRepository) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    const screenplay = await screenplayRepository.findOne({
      where: { id: req.params.id }
    });
    if (!screenplay) {
      return res.status(404).json({ error: 'Screenplay not found' });
    }
    res.json(screenplay);
  } catch (error) {
    console.error('Error fetching screenplay:', error);
    res.status(500).json({ error: 'Failed to fetch screenplay' });
  }
});

app.post('/screenplays', async (req, res) => {
  try {
    if (!screenplayRepository) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    const screenplay = screenplayRepository.create(req.body);
    const savedScreenplay = await screenplayRepository.save(screenplay);
    res.status(201).json(savedScreenplay);
  } catch (error) {
    console.error('Error creating screenplay:', error);
    res.status(500).json({ error: 'Failed to create screenplay' });
  }
});

app.put('/screenplays/:id', async (req, res) => {
  try {
    if (!screenplayRepository) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    const screenplay = await screenplayRepository.findOne({
      where: { id: req.params.id }
    });
    if (!screenplay) {
      return res.status(404).json({ error: 'Screenplay not found' });
    }
    
    // Update fields
    Object.assign(screenplay, req.body, { id: req.params.id });
    const updatedScreenplay = await screenplayRepository.save(screenplay);
    res.json(updatedScreenplay);
  } catch (error) {
    console.error('Error updating screenplay:', error);
    res.status(500).json({ error: 'Failed to update screenplay' });
  }
});

app.delete('/screenplays/:id', async (req, res) => {
  try {
    if (!screenplayRepository) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    const result = await screenplayRepository.delete(req.params.id);
    if (result.affected === 0) {
      return res.status(404).json({ error: 'Screenplay not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting screenplay:', error);
    res.status(500).json({ error: 'Failed to delete screenplay' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
