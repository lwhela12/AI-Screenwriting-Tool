# AI‑Integrated Screenwriting Tool

This repository contains the source code for an open‑source screenwriting application inspired by **Final Draft 13**.  It provides professional screenplay formatting, planning tools such as a beat board and outline editor, real‑time collaboration and AI‑assisted writing features.

## Monorepo Structure

This project is organized as a monorepo with three main packages:

- **client** – React front‑end that renders the UI.
- **server** – Node.js/Express server for collaboration APIs.
- **ai_service** – Python FastAPI microservice that powers AI features.

Each package contains its own `README` with more details.

## Features

- **Automatic screenplay formatting** – Scene headings, character names and dialogue are recognized and formatted automatically, using an intuitive plain‑text syntax.
- **Beat Board & Outline Editor** – A visual canvas for organizing beats and a hierarchical outline with customizable lanes.  Supports drag‑and‑drop, color‑coded structure lines and flow lines.
- **ScriptNotes and Revision Mode** – Add notes anywhere in your script or beat board, track changes and mark revisions with colors.
- **Real‑Time Collaboration** – Multiple writers can work on the same project simultaneously.  User presence and chat are included.
- **Writing Metrics** – Set goals, run sprint timers and view statistics about scene length, character dialogue and more.
- **Import/Export** – Open and save files in Fountain, Final Draft (FDX) and PDF formats.  Tag props and locations for production reports.
- **AI Assistance** – An optional AI service provides context‑aware suggestions, dialogue auto‑completion and story analysis.

For a full description of the planned architecture and feature roadmap, see **design_document.md**.

## Editor Keystrokes

The script editor follows Final Draft's typing model. The document is a flat list of elements; every command acts on the element under the cursor.

| Key | Behaviour |
|---|---|
| **Enter** at end of element | Scene Heading → Action, Action → Action, Character → Dialogue, Parenthetical → Dialogue, Dialogue → Action, Transition → Scene Heading |
| **Enter** mid-element | Splits the element; both halves keep their type |
| **Enter** on an empty element | Opens the element menu (arrows, digits 1–7, or click) |
| **Tab** | Scene Heading: adds ` - ` for the time, then moves to Action. Action → Character, Character → Parenthetical, Parenthetical → Dialogue, Dialogue → Parenthetical, Transition → Scene Heading. An empty element is converted in place instead of creating a new one |
| **Shift-Tab** | Cycles the current element to the previous type |
| **Backspace** at start of element | Removes an empty element, or joins the text onto the previous element |
| **⌘1 – ⌘8** (Ctrl on Windows) | Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, Centered |
| **⌘⇧D** | Dual dialogue: prints the speech under the cursor beside the one before it (press again to separate) |
| **⌘S** | Save (autosave also runs three seconds after you stop typing) |

Auto-formatting only touches what you just typed: scene headings, character names and transitions are upper-cased as you type; `int.`/`ext.` at the start of an action line becomes a scene heading; a line ending in `TO:` becomes a transition; `> text <` becomes centered text; `(` in an empty dialogue element starts a parenthetical. SmartType suggests known characters, locations, times and transitions (Tab or Enter accepts, Escape dismisses).

Pagination reproduces Final Draft's screenplay template: 54 lines of 12pt Courier per page inside 1 inch margins (7pt character advance, 61 characters of action), two blank lines before scene headings, splits only after a complete sentence with the remainder re-wrapped, `(MORE)` and the `(CONT'D)` cue printed in the page margins as Final Draft does, at least two rows of a speech kept with its cue, dialogue that crosses a page gets `(MORE)` and a `NAME (CONT'D)` cue, scene headings and character cues are never stranded at the bottom of a page, action never leaves a single line behind, and transitions stay with what precedes them. The same engine drives the on-screen page gaps, the page counter, and the PDF export, so they always agree.

The **Scenes** panel beside the script lists every scene with its page and length. Click a scene to jump to it, drag to reorder scenes (the pages move with them), expand a scene to write its synopsis, which is stored with the scene and exports to Final Draft.

The **Outline** tab shows the same scenes as index cards: heading, synopsis, cast, page and length, a colour, and structure labels (Act One, Midpoint…) between cards. Drag a card to reorder the script, add or delete scenes, and open any scene in the editor. The **Beat Board** is a freeform canvas of ideas: double-click to add a beat, drag to arrange, and send a beat into the script as a new scene with the beat's text as its synopsis.

The title page is the first sheet above the script; click any field to edit it. When a character speaks again after only action, the cue gets an automatic `(CONT'D)`, computed from the script so it stays right as you edit. Typing `(` in a character cue offers the standard extensions (V.O., O.S., …).

The **Reports** tab gives a character report (scenes, speeches, words, share of dialogue, first and last scene), a scene report (page, length, INT/EXT, time, cast), a who-is-in-which-scene matrix, and dialogue statistics, with CSV download.

Scripts can be imported from the project screen (**Import script…**): Final Draft `.fdx`, Fountain `.fountain`, or plain text. Final Draft files Scene numbers, synopses, dual dialogue, centered text, page breaks, bold/italic/underline and the title page are preserved, and the FDX export writes them back. Fountain import understands sections (structure labels), synopses, scene numbers, forced elements, dual dialogue and emphasis, and Fountain export writes them all.

Run the editor tests with `cd client && npm test`.

## Quick Start

1. **Install Dependencies**

   ```bash
   git clone <this‑repo>
   cd <this‑repo>
   npm install
   ```

   If you plan to run the AI service locally, also install the Python dependencies:

   ```bash
   cd ai_service
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Run the Application**

   In separate terminals:

   ```bash
   # Start the API/collaboration server
   npm run dev:server

   # Start the Electron/Tauri client
   npm run dev:client

   # Run the AI service (optional)
   cd ai_service
   uvicorn main:app --reload
   ```

   The app will open in a desktop window.  By default, it connects to the local API server and AI service.

3. **Environment Variables**

   Create a `.env` file in the project root to configure ports, database connection strings and API keys (e.g., OpenAI API key).  See `.env.example` (to be provided) for defaults.  Never commit secrets to the repository.

## Contributing

We welcome contributions!  Please read **Agents.md** for guidelines on environment setup, coding standards and the development workflow.  Before starting work, review the open issues and the design document.  For major changes, open a discussion or issue first to ensure it aligns with the project roadmap.

## License

This project is released under the MIT License (or the license specified in `LICENSE`).  See the `LICENSE` file for details.
