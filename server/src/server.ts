import express from 'express';

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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
