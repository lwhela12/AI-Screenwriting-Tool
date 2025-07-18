# Agents Guide

This repository hosts an open‑source screenwriting tool with AI integration.  The goal is to replicate and extend Final Draft 13’s features while remaining open and extensible.  Below are guidelines for agents who will contribute to this project.

## Project Overview

The tool includes a screenplay editor with automatic formatting, a beat board, an outline editor, revision mode, real‑time collaboration and production tools.  An AI service provides story analysis and dialogue auto‑completion.  See `design_document.md` for the detailed architecture and development plan.

## Environment Setup

1. **Prerequisites** – Ensure you have Node.js (v18+) and npm installed.  For the AI microservice you will also need Python 3.9+.  Docker is recommended for consistent environments.
2. **Install dependencies**:

   ```bash
   # Clone the repository (replace URL once the repo is created)
   git clone <repo-url>
   cd <repo-name>

   # Install Node dependencies for the front‑end and server
   npm install

   # (Optional) Set up Python environment for the AI service
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r ai_service/requirements.txt
   ```

3. **Running the development environment**:

   ```bash
   # Start the Node API server (development)
   npm run dev:server

   # In a separate terminal start the Electron/Tauri app
   npm run dev:client

   # Run the AI service
   cd ai_service
   uvicorn app:app --reload
   ```

   The clients will connect to `localhost` ports specified in the `.env` file.

4. **Environment variables** – Use a `.env` file to store secrets (e.g., OpenAI API keys).  Do **not** commit secrets to the repository.

## Contribution Guidelines

1. **Follow the Design Document** – Always consult `design_document.md` for the target architecture and feature requirements.  When implementing a module, adhere to the suggested interfaces and data models.
2. **Use TypeScript and Strict Typing** – For the Node.js and front‑end code, use TypeScript with strict options enabled.  Type definitions improve reliability and ease of collaboration.
3. **Write Clear Commits** – Commit messages should be descriptive and reference any related issues.  Use conventional commits (`feat:`, `fix:`, `docs:`) to make history easy to read.
4. **Document Your Code** – Provide JSDoc comments for functions, explain complex logic and add high‑level comments to modules.  When adding new API endpoints or features, update the relevant documentation.
5. **Testing** – Write unit tests for new functionality.  Use Jest for Node/React components and pytest for Python code.  Do not merge changes without tests unless explicitly approved.
6. **Linting & Formatting** – Use the configured ESLint and Prettier rules.  Committers should run `npm run lint` and `npm run format` before submitting pull requests.
7. **AI Integration** – When working on AI features, respect privacy.  Use the vector store and summarization utilities provided.  All AI suggestions must be optional and clearly separated from user text.
8. **Plugin Development** – Plugins should conform to the plugin API.  Each plugin must be documented with its purpose, API surface and configuration options.  Keep plugins decoupled from core modules.
9. **Issue Tracking** – Before starting work on a feature, check the issue tracker for existing tasks or open one if needed.  Provide a brief implementation plan and request feedback before significant changes.

## Development Workflow

1. **Branching** – Create feature branches off the `main` branch for your work (e.g., `feat/beat‑board‑lanes`).
2. **Pull Requests** – Open a PR when your feature is complete and tests pass.  Link the relevant issue and request reviews.
3. **Code Review** – Participate in code reviews for other agents.  Offer constructive feedback and verify that changes align with the design.
4. **Continuous Integration** – The CI pipeline runs linting, tests and build checks.  Ensure your changes pass before merging.
5. **Regular Sync** – Keep your branch up to date with `main` by pulling regularly and resolving conflicts promptly.

## Important Notes

- **User Privacy** – Do not log or transmit user scripts without explicit permission.  Sensitive data must remain on the user’s device unless they opt into cloud sync.
- **Accessibility** – Design UI components with accessibility in mind.  Use semantic HTML and provide keyboard navigation.
- **Extensibility** – Write modular code.  Avoid tightly coupling features so that plugins and future contributors can extend functionality.

For any questions, refer to the design document or open an issue in the repository.  Thank you for contributing!
