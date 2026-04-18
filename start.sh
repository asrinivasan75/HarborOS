#!/bin/bash
# HarborOS — One-command startup
# Starts both backend (port 8000) and frontend (port 3000)

set -e

echo "=== HarborOS Starting ==="

# Backend
echo "Starting backend..."
cd backend
source venv/bin/activate
python -m app.seed
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend
echo "Starting frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== HarborOS Running ==="
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
