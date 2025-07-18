# Client

This directory contains the React based front-end for the AI‑Integrated Screenwriting Tool.
It provides the user interface and interacts with the collaboration server and AI service.

## Development

Install dependencies and start the development server:

```bash
cd client
npm install
npm start
```

The app will launch a development build of the React UI. The main view now renders the **Beat Board** for planning your story structure.

### Beat Board Usage

- **Add lanes** – click "Add Lane" to create new columns for organizing beats.
- **Add beats** – within each lane use "Add Beat" and fill in the prompts.
- **Drag & drop** – reorder beats within a lane or move them between lanes.
- Beats are saved to your browser storage so refreshing will preserve them.

### Editor Usage

- **Dark mode** – toggle using the toolbar button.
- **Typewriter mode** – centers the active line vertically.
- **Auto‑completion** – as you type character names or scene headings, suggestions appear.

Future versions will expand formatting and collaboration features.
