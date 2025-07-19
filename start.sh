#!/bin/bash

# AI Screenwriting Tool - Quick Start Script

echo "🎬 Starting AI Screenwriting Tool..."
echo ""

# Check if node_modules exists in root
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
fi

# Check if server dependencies are installed
if [ ! -d "server/node_modules" ]; then
    echo "📦 Installing server dependencies..."
    cd server && npm install && cd ..
fi

# Check if client dependencies are installed
if [ ! -d "client/node_modules" ]; then
    echo "📦 Installing client dependencies..."
    cd client && npm install && cd ..
fi

# Check if Python dependencies are installed (optional)
if command -v python3 &> /dev/null; then
    echo "🐍 Checking Python dependencies..."
    cd ai_service
    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt --quiet
    fi
    cd ..
fi

echo ""
echo "🚀 Starting all services..."
echo "   - Server will run on http://localhost:5001"
echo "   - Client will run on http://localhost:3000"
echo "   - AI service will run on http://localhost:8000 (if Python is available)"
echo ""

# Start all services
npm run dev