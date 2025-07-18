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

The app will launch a development build of the React UI. The main view now renders the **Editor** component which uses CodeMirror for screenplay editing.

### Editor Usage

- **Dark mode** – toggle using the toolbar button.
- **Typewriter mode** – centers the active line vertically.
- **Auto‑completion** – as you type character names or scene headings, suggestions appear.

Future versions will expand formatting and collaboration features.
