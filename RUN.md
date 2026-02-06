# 🚀 AdversaRL - Cyberpunk Command Center

## Quick Start

### Terminal 1 - Frontend
```bash
cd dashboard
npm run dev
```

### Terminal 2 - Backend (Optional for metrics)
```bash
python3 main.py
```

Then open: **http://localhost:3000/stream**

---

## The Three-Panel Command Center

### 🌍 **LEFT PANEL - "THE WORLD"**
- **Live Odyssey video stream** showing the training environment
- **Real-time environment transformations** via floating action buttons
- Send text prompts mid-stream to adapt the world (dim lights, add fog, add clutter, etc.)
- Displays current environment prompt, FPS, frame count
- Cyberpunk cyan accent with glassmorphism

### 🤖 **RIGHT PANEL - "THE AGENT"**
- **3D robot arm visualization** using Three.js
- Procedural 6-DOF manipulator with cyberpunk styling
- **Neon grid floor** with void background and bloom effects
- Live HUD overlays showing:
  - Joint angles (6 joints with gradient bars)
  - End effector position (X, Y, Z coordinates)
  - Gripper state (open/closed)
- Magenta accent with interactive orbit controls

### ⚡ **BOTTOM PANEL - "THE BRIDGE"**
- **Curriculum controller feed** showing detected failure modes
- **Real-time perturbations** that adapt the environment
- **Training metrics visualization** (success rate over time)
- **Neural link** between World and Agent
- Visual propagation: curriculum log → world transform → agent reaction
- Yellow accent representing the connection

---

## How It Works

### Odyssey Integration (THE WORLD)
The Odyssey SDK connects directly in the browser using dynamic imports:
```javascript
const loadModule = new Function('return import("https://esm.sh/@odysseyml/odyssey")');
const { Odyssey } = await loadModule();
const client = new Odyssey({ apiKey: '...' });
const mediaStream = await client.connect();
videoElement.srcObject = mediaStream;
await client.startStream({ prompt: '...', portrait: false });
```

### Three.js Robot (THE AGENT)
- Procedural robot arm built with Three.js primitives
- Cyberpunk materials: metallic surfaces with emissive neon glow
- Animated joints responding to WebSocket data
- Grid floor with fog and dramatic lighting

### WebSocket Data Flow (THE BRIDGE)
```python
# Backend streams at 20 Hz:
{
  "type": "agent_state",
  "joint_angles": [...],
  "end_effector": {x, y, z},
  "gripper_state": "open"
}

{
  "type": "metrics",
  "reward": 8.3,
  "success_rate": 0.87,
  "episode": 245
}

{
  "type": "perturbation",
  "failure_mode": "Low success rate in dim lighting",
  "prompt": "Dim the lights significantly..."
}
```

---

## Troubleshooting

### No Odyssey Video
1. Check browser console (F12) for errors
2. Odyssey allows **1 concurrent session** - close other tabs
3. Wait 10-15 seconds for first connection
4. Check API key in code (hardcoded for demo)

### No Metrics/Agent Animation
- Backend not running: Start `python3 main.py`
- WebSocket connection failed: Check port 8000 is free
- The dashboard will show "Monitoring for failure patterns..." if no backend

### Backend Requirements
```bash
pip install fastapi uvicorn websockets
```

---

## Design Notes

**Aesthetic**: Deep blacks, neon cyan/magenta/yellow accents, glassmorphism panels, monospace fonts, sci-fi command center

**Fonts**:
- Headers: Rajdhani (bold, geometric)
- Body/Data: JetBrains Mono (monospace)

**Three Panels, One System**:
- When curriculum detects failure → log appears in BRIDGE
- Prompt sent to Odyssey → WORLD transforms
- Agent receives new observations → updates in real-time
- All three panels pulse/animate to show the connection

---

## Production Notes

- API key is currently hardcoded for demo (move to env vars)
- Backend provides simulated training data (replace with real RL loop)
- Robot visualization is procedural (can load real URDF with urdf-loader)
- WebSocket currently uses mock data (integrate with actual PPO training)

---

**Built for $25k first place** 🏆
