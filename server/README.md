# Server

This directory contains the Node.js/Express collaboration server for the AI‑Integrated Screenwriting Tool.

The development server exposes a small JSON REST API backed by an in‑memory store. It is intended only for testing purposes and does not persist data between runs.

### Available Endpoints

* `GET /status` – Health check.
* `GET /projects` – List all projects.
* `POST /projects` – Create a new project. Body: `{ "name": "My Project" }`.
* `GET /projects/:id/beats` – Retrieve beat board data for a project.
* `PUT /projects/:id/beats` – Replace the beat board data.
* `GET /projects/:id/outlines` – Retrieve outline data for a project.
* `PUT /projects/:id/outlines` – Replace the outline data.

All routes accept and return JSON. CORS headers are enabled so that the React client can communicate with the API during development.
