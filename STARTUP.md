# Quick Start Guide

## One-Command Startup

The AI Screenwriting Tool now has unified startup scripts. You no longer need to open multiple terminals!

### Option 1: Using npm (Recommended)

From the root directory, simply run:

```bash
npm run dev
```

This will:
1. Start the server on http://localhost:5001
2. Start the client on http://localhost:3000
3. Start the AI service on http://localhost:8000 (if Python is available)

### Option 2: Using the start script

```bash
./start.sh
```

This script will also check and install dependencies if needed.

### First Time Setup

If this is your first time running the project:

```bash
npm run install:all
```

This will install all dependencies for the root, server, client, and Python services.

## Available Scripts

- `npm run dev` - Start all services in development mode
- `npm run install:all` - Install all dependencies (Node + Python)
- `npm run install:node` - Install only Node.js dependencies
- `npm run build` - Build both server and client for production
- `npm run clean` - Remove all node_modules directories
- `npm run clean:install` - Clean and reinstall everything

## Individual Service Commands

If you need to run services separately:

- `npm run dev:server` - Start only the server
- `npm run dev:client` - Start only the client
- `npm run dev:ai` - Start only the AI service

## Troubleshooting

- If the AI service fails to start, make sure Python 3 is installed and `uvicorn` is available
- If ports are already in use, check the configuration:
  - Server: 5001
  - Client: 3000
  - AI Service: 8000

## Stop All Services

Press `Ctrl+C` in the terminal to stop all services at once.