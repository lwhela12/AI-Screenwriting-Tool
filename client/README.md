# Client

This directory contains the React based front-end for the AI‑Integrated Screenwriting Tool.
It provides the user interface and interacts with the collaboration server and AI service. Beat board and outline data are fetched from the server's JSON API instead of using browser storage.

## Development

Install dependencies and start the development server:

```bash
cd client
npm install
npm start
```

The app will launch a development build of the React UI. A simple toolbar allows switching between the **Beat Board**, **Outline Editor** and script **Editor** views.

### Beat Board Usage

- **Add lanes** – click "Add Lane" to create new columns for organizing beats.
- **Add beats** – within each lane use "Add Beat" and fill in the inline form.
- **Drag & drop** – reorder beats within a lane or move them between lanes.
- Beat data is loaded from the development API and saved back whenever changes are made.

### Outline Editor Usage

- Click "Outline Editor" in the toolbar to open it.
- **Add lanes** – create structural lanes (e.g., Acts or Sequences).
- **Add cards** – each card can be given a title, description and color.
- **Drag & drop** – move cards within and between lanes to plan your story.
- Edit lane titles or delete lanes using the lane controls.
- Outline data is loaded from the development API and persisted via API calls.

### Editor Usage

- **Dark mode** – toggle using the toolbar button.
- **Typewriter mode** – centers the active line vertically.
- **Auto‑completion** – as you type character names or scene headings, suggestions appear.

### Dependencies

The front-end relies on `react-beautiful-dnd` for drag and drop interactions, along with `@codemirror` packages for the screenplay editor.

Future versions will expand formatting and collaboration features.
