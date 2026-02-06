#!/bin/bash

# Start AdversaRL Full Demo - Backend + Frontend

echo "======================================================================"
echo "🚀 Starting AdversaRL - REAL Odyssey Integration"
echo "======================================================================"
echo ""
echo "This will start:"
echo "  1. Backend WebSocket server (port 8000) - Real Odyssey streaming"
echo "  2. Frontend dashboard (port 3000) - Live visualization"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Kill any existing processes on these ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

sleep 1

# Start backend in background
echo ""
echo "📡 Starting backend server (Odyssey → WebSocket)..."
cd /Users/kuant/hackathons/odyssey
python backend/server.py > logs/backend.log 2>&1 &
BACKEND_PID=$!

sleep 3

# Check if backend started
if ps -p $BACKEND_PID > /dev/null; then
   echo "✅ Backend running (PID: $BACKEND_PID)"
   echo "   WebSocket: ws://localhost:8000/ws"
   echo "   Health: http://localhost:8000/health"
else
   echo "❌ Backend failed to start. Check logs/backend.log"
   exit 1
fi

# Start frontend in background
echo ""
echo "🎨 Starting frontend dashboard..."
cd /Users/kuant/hackathons/odyssey/dashboard
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

# Check if frontend started
if ps -p $FRONTEND_PID > /dev/null; then
   echo "✅ Frontend running (PID: $FRONTEND_PID)"
   echo "   Dashboard: http://localhost:3000"
else
   echo "❌ Frontend failed to start. Check logs/frontend.log"
   kill $BACKEND_PID 2>/dev/null
   exit 1
fi

echo ""
echo "======================================================================"
echo "✅ ALL SYSTEMS RUNNING!"
echo "======================================================================"
echo ""
echo "🎬 REAL Odyssey video streaming to dashboard"
echo "📊 Live training metrics updating"
echo "⚡ Curriculum adaptations ready"
echo ""
echo "👉 Open in browser: http://localhost:3000"
echo ""
echo "Logs:"
echo "  Backend:  tail -f logs/backend.log"
echo "  Frontend: tail -f logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT

# Keep script running
tail -f /dev/null
