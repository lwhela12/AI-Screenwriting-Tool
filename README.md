# AI‑Integrated Screenwriting Tool

This repository contains the source code for an open‑source screenwriting application inspired by **Final Draft 13**.  It provides professional screenplay formatting, planning tools such as a beat board and outline editor, real‑time collaboration and AI‑assisted writing features.

## Features

- **Automatic screenplay formatting** – Scene headings, character names and dialogue are recognized and formatted automatically, using an intuitive plain‑text syntax.
- **Beat Board & Outline Editor** – A visual canvas for organizing beats and a hierarchical outline with customizable lanes.  Supports drag‑and‑drop, color‑coded structure lines and flow lines.
- **ScriptNotes and Revision Mode** – Add notes anywhere in your script or beat board, track changes and mark revisions with colors.
- **Real‑Time Collaboration** – Multiple writers can work on the same project simultaneously.  User presence and chat are included.
- **Writing Metrics** – Set goals, run sprint timers and view statistics about scene length, character dialogue and more.
- **Import/Export** – Open and save files in Fountain, Final Draft (FDX) and PDF formats.  Tag props and locations for production reports.
- **AI Assistance** – An optional AI service provides context‑aware suggestions, dialogue auto‑completion and story analysis.

For a full description of the planned architecture and feature roadmap, see **design_document.md**.

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
   uvicorn app:app --reload
   ```

   The app will open in a desktop window.  By default, it connects to the local API server and AI service.

3. **Environment Variables**

   Create a `.env` file in the project root to configure ports, database connection strings and API keys (e.g., OpenAI API key).  See `.env.example` (to be provided) for defaults.  Never commit secrets to the repository.

## Contributing

We welcome contributions!  Please read **Agents.md** for guidelines on environment setup, coding standards and the development workflow.  Before starting work, review the open issues and the design document.  For major changes, open a discussion or issue first to ensure it aligns with the project roadmap.

## License

This project is released under the MIT License (or the license specified in `LICENSE`).  See the `LICENSE` file for details.
