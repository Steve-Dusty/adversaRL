'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Radio, Cpu, Activity, Target, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import RobotVisualization from '@/components/RobotVisualization';

interface MetricData {
  timestamp: number;
  reward: number;
  success_rate: number;
  episode: number;
}

interface PerturbationEvent {
  id: string;
  timestamp: number;
  failureMode: string;
  prompt: string;
  active: boolean;
  // LLM judge fields
  observation?: string;
  reasoning?: string;
  difficulty?: number;
  judgeType?: 'llm' | 'rule-based';
}

export default function CommandCenter() {
  // Odyssey state
  const [odysseyStatus, setOdysseyStatus] = useState('Initializing...');
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<any>(null);

  // Agent state
  const [jointAngles, setJointAngles] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [endEffectorPos, setEndEffectorPos] = useState({ x: 0, y: 0, z: 0 });
  const [gripperState, setGripperState] = useState<'open' | 'closed'>('open');

  // Training metrics
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [currentReward, setCurrentReward] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [episode, setEpisode] = useState(0);

  // Curriculum state
  const [perturbations, setPerturbations] = useState<PerturbationEvent[]>([]);
  const [activePerturbation, setActivePerturbation] = useState<string | null>(null);

  // Initialize Odyssey
  useEffect(() => {
    let mounted = true;
    let frameTimer: NodeJS.Timeout;
    let lastFrameCount = 0;

    const initOdyssey = async () => {
      try {
        setOdysseyStatus('Loading Odyssey SDK...');

        const loadModule = new Function('return import("https://esm.sh/@odysseyml/odyssey")');
        const module = await loadModule();
        const { Odyssey } = module;

        if (!mounted) return;

        setOdysseyStatus('Connecting to world model...');

        const client = new Odyssey({
          apiKey: 'ody_Be3JiPrprZrevJ8lpzMr4ilYhBbHpTY5'
        });

        clientRef.current = client;

        const mediaStream = await client.connect();

        if (!mounted) return;

        setOdysseyStatus('Connected - Initializing environment...');

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(e => console.log('Play pending:', e));
        }

        setIsConnected(true);

        // Load training spec to get the environment prompt
        let initialPrompt = 'A robotic arm workspace: white tabletop with red cube, workshop lighting, clean industrial environment';
        try {
          const specResponse = await fetch('/api/get-training-spec');
          if (specResponse.ok) {
            const specData = await specResponse.json();
            if (specData.spec?.environment_prompt) {
              // Combine robot arm prompt with user's environment description
              const userEnvironment = specData.spec.environment_prompt;
              initialPrompt = `A robotic arm actively reaching and manipulating objects. ${userEnvironment}. The robot arm is moving smoothly, performing pick and place operations.`;
              console.log('✅ Using training spec environment:', initialPrompt);
            }
          }
        } catch (err) {
          console.log('⚠️ Could not load training spec, using default prompt');
        }

        setCurrentPrompt(initialPrompt);

        setTimeout(async () => {
          if (!mounted) return;

          try {
            setOdysseyStatus('Generating world...');
            await client.startStream({
              prompt: initialPrompt,
              portrait: false
            });

            if (mounted) {
              setIsStreaming(true);
              setOdysseyStatus('LIVE');
            }
          } catch (err: any) {
            console.error('Start stream error:', err);
            setOdysseyStatus(`Error: ${err.message}`);
          }
        }, 1000);

      } catch (error: any) {
        console.error('Odyssey init error:', error);
        setOdysseyStatus(`Error: ${error.message}`);
      }
    };

    initOdyssey();

    // FPS counter
    frameTimer = setInterval(() => {
      if (mounted && isStreaming) {
        const newFrameCount = frameCount + 1;
        setFrameCount(newFrameCount);
        setFps(Math.round((newFrameCount - lastFrameCount)));
        lastFrameCount = newFrameCount;
      }
    }, 50);

    return () => {
      mounted = false;
      clearInterval(frameTimer);
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch (e) {
          console.log('Disconnect error:', e);
        }
      }
    };
  }, []);

  // WebSocket connection for metrics
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws');

        ws.onopen = () => {
          console.log('✅ WebSocket connected');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.type === 'metrics') {
        const metric: MetricData = {
          timestamp: Date.now(),
          reward: data.reward,
          success_rate: data.success_rate,
          episode: data.episode
        };
        setMetrics(prev => [...prev.slice(-100), metric]);
        setCurrentReward(data.reward);
        setSuccessRate(data.success_rate);
        setEpisode(data.episode);
      }

        if (data.type === 'agent_state') {
          setJointAngles(data.joint_angles || [0, 0, 0, 0, 0, 0]);
          setEndEffectorPos(data.end_effector || { x: 0, y: 0, z: 0 });
          setGripperState(data.gripper_state || 'open');
        }

        if (data.type === 'perturbation') {
        const perturbation: PerturbationEvent = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          failureMode: data.failure_mode,
          prompt: data.curriculum_prompt || data.prompt,
          active: true,
          observation: data.observation,
          reasoning: data.reasoning,
          difficulty: data.difficulty,
          judgeType: data.judge_type || 'rule-based'
        };
        setPerturbations(prev => [perturbation, ...prev.slice(0, 9)]);
        setActivePerturbation(perturbation.id);

        // Send to Odyssey
        sendEnvironmentPrompt(perturbation.prompt);

        // Clear active state after animation
        setTimeout(() => {
          setActivePerturbation(null);
        }, 3000);
      }
    };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket closed, reconnecting...');
          reconnectTimeout = setTimeout(connect, 2000);
        };
      } catch (error) {
        console.error('WebSocket connection failed:', error);
        reconnectTimeout = setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const sendEnvironmentPrompt = async (prompt: string) => {
    if (clientRef.current && isStreaming) {
      try {
        await clientRef.current.interact({ prompt });
        setCurrentPrompt(prompt);
        console.log('✅ Environment transformed:', prompt);
      } catch (err) {
        console.error('Interaction error:', err);
      }
    }
  };

  const quickActions = [
    { label: 'Move to Cube', prompt: 'The robot arm smoothly reaches toward the red cube on the table', icon: Zap, color: 'cyan' },
    { label: 'Grasp Cube', prompt: 'The gripper closes around the red cube and lifts it slowly', icon: Zap, color: 'cyan' },
    { label: 'Dim Lights', prompt: 'Significantly dim the lighting, darker shadows, low visibility', icon: Zap, color: 'magenta' },
    { label: 'Add Clutter', prompt: 'Add scattered tools and objects on the table creating obstacles around the cube', icon: Zap, color: 'magenta' },
    { label: 'Add Fog', prompt: 'Add heavy fog and atmospheric haze reducing visibility significantly', icon: Zap, color: 'yellow' },
    { label: 'Move to Target', prompt: 'The robot arm moves the cube to a target position on the right side of the table', icon: Zap, color: 'yellow' }
  ];

  return (
    <div className="h-screen bg-black text-white overflow-hidden flex flex-col font-mono">
      {/* Header */}
      <div className="h-14 border-b border-cyan-500/30 bg-black/90 backdrop-blur-xl flex items-center justify-between px-6 relative z-50">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-black tracking-wider" style={{ fontFamily: 'Rajdhani, monospace' }}>
            ADVERSA<span className="text-cyan-400">RL</span>
          </h1>
          <div className="h-6 w-px bg-cyan-500/30" />
          <div className="text-xs text-cyan-400/70 uppercase tracking-widest">
            Adaptive Curriculum Command Center
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-xs text-gray-400">Episode {episode}</span>
          </div>
          <div className="text-xs text-cyan-400">
            Success Rate: <span className="font-bold text-lg">{(successRate * 100).toFixed(1)}%</span>
          </div>
          <Link href="/dashboard">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-magenta-500/20 hover:bg-magenta-500/30 border border-magenta-500/40 rounded-lg transition text-xs">
              <Activity className="w-3 h-3" />
              <span>Dashboard</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Row - Split */}
        <div className="flex-1 flex gap-3 p-3">
          {/* LEFT - THE WORLD */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 relative rounded-lg overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 to-black"
            style={{
              boxShadow: '0 0 30px rgba(0, 255, 255, 0.1), inset 0 0 30px rgba(0, 255, 255, 0.05)'
            }}
          >
            {/* Glass panel header */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-md border-b border-cyan-500/20 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-sm font-bold text-cyan-400 tracking-wider">THE WORLD</span>
                <div className="text-xs text-gray-400">
                  {fps} FPS • Frame {frameCount}
                </div>
              </div>
              <div className={`text-xs px-2 py-1 rounded ${isStreaming ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {odysseyStatus}
              </div>
            </div>

            {/* Video stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Scanlines overlay */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJzY2FubGluZXMiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIxIiBoZWlnaHQ9IjIiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI3NjYW5saW5lcykiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />

            {/* Current prompt display */}
            <div className="absolute bottom-3 left-3 right-3 bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-3">
              <div className="text-xs text-cyan-400/70 mb-1">CURRENT ENVIRONMENT</div>
              <div className="text-xs text-gray-300 leading-relaxed">{currentPrompt}</div>
            </div>

            {/* Action buttons */}
            {isStreaming && (
              <div className="absolute top-16 right-3 space-y-1.5">
                {quickActions.map((action, idx) => (
                  <motion.button
                    key={action.label}
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => sendEnvironmentPrompt(action.prompt)}
                    className={`flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-md border rounded-lg transition-all text-xs group hover:scale-105 ${
                      action.color === 'cyan' ? 'border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/10' :
                      action.color === 'magenta' ? 'border-magenta-500/30 hover:border-magenta-500/60 hover:bg-magenta-500/10' :
                      'border-yellow-500/30 hover:border-yellow-500/60 hover:bg-yellow-500/10'
                    }`}
                  >
                    <action.icon className={`w-3 h-3 ${
                      action.color === 'cyan' ? 'text-cyan-400' :
                      action.color === 'magenta' ? 'text-magenta-400' :
                      'text-yellow-400'
                    }`} />
                    <span className="text-gray-300 group-hover:text-white">{action.label}</span>
                  </motion.button>
                ))}
              </div>
            )}

            {/* Loading overlay */}
            {!isStreaming && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-cyan-400 border-t-transparent"
                  />
                  <div className="text-cyan-400 text-sm">{odysseyStatus}</div>
                </div>
              </div>
            )}
          </motion.div>

          {/* RIGHT - THE AGENT */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 relative rounded-lg overflow-hidden border border-magenta-500/30 bg-gradient-to-br from-magenta-950/20 to-black"
            style={{
              boxShadow: '0 0 30px rgba(255, 0, 255, 0.1), inset 0 0 30px rgba(255, 0, 255, 0.05)'
            }}
          >
            {/* Glass panel header */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-md border-b border-magenta-500/20 px-4 py-2">
              <div className="flex items-center gap-3">
                <Cpu className="w-4 h-4 text-magenta-400" />
                <span className="text-sm font-bold text-magenta-400 tracking-wider">THE AGENT</span>
                <div className="text-xs text-gray-400">
                  6-DOF Manipulator
                </div>
              </div>
            </div>

            {/* 3D Robot Visualization */}
            <RobotVisualization
              jointAngles={jointAngles}
              endEffectorPos={endEffectorPos}
              gripperState={gripperState}
            />

            {/* HUD Overlays */}
            <div className="absolute bottom-3 left-3 space-y-2">
              <div className="bg-black/80 backdrop-blur-md border border-magenta-500/30 rounded-lg px-3 py-2">
                <div className="text-xs text-magenta-400/70 mb-1">END EFFECTOR</div>
                <div className="text-xs text-gray-300 font-mono space-y-0.5">
                  <div>X: {endEffectorPos.x.toFixed(3)}m</div>
                  <div>Y: {endEffectorPos.y.toFixed(3)}m</div>
                  <div>Z: {endEffectorPos.z.toFixed(3)}m</div>
                </div>
              </div>

              <div className="bg-black/80 backdrop-blur-md border border-magenta-500/30 rounded-lg px-3 py-2">
                <div className="text-xs text-magenta-400/70 mb-1">GRIPPER</div>
                <div className={`text-xs font-bold ${gripperState === 'closed' ? 'text-green-400' : 'text-gray-400'}`}>
                  {gripperState.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Joint angles display */}
            <div className="absolute top-16 right-3 bg-black/80 backdrop-blur-md border border-magenta-500/30 rounded-lg px-3 py-2">
              <div className="text-xs text-magenta-400/70 mb-2">JOINT ANGLES</div>
              <div className="space-y-1">
                {jointAngles.map((angle, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8">J{idx + 1}</span>
                    <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-magenta-500 to-cyan-400 transition-all"
                        style={{ width: `${((angle + Math.PI) / (2 * Math.PI)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right">{(angle * 180 / Math.PI).toFixed(0)}°</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* BOTTOM - THE BRIDGE */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-64 mx-3 mb-3 rounded-lg border border-yellow-500/30 bg-gradient-to-r from-yellow-950/10 via-black to-cyan-950/10 overflow-hidden relative"
          style={{
            boxShadow: '0 0 40px rgba(255, 255, 0, 0.1), inset 0 0 40px rgba(255, 255, 0, 0.03)'
          }}
        >
          {/* Header */}
          <div className="bg-black/60 backdrop-blur-md border-b border-yellow-500/20 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-bold text-yellow-400 tracking-wider">THE BRIDGE</span>
              <div className="text-xs text-gray-400">
                World ⟷ Agent Neural Link
              </div>
            </div>
            <div className="text-xs text-gray-400">
              Reward: <span className={`font-bold ${currentReward > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentReward.toFixed(3)}
              </span>
            </div>
          </div>

          <div className="flex h-[calc(100%-44px)]">
            {/* Curriculum Log */}
            <div className="w-2/5 border-r border-yellow-500/20 p-4 overflow-y-auto">
              <div className="text-xs text-yellow-400/70 mb-3 uppercase tracking-wider flex items-center gap-2">
                <Target className="w-3 h-3" />
                Curriculum Controller
              </div>

              <div className="space-y-2">
                <AnimatePresence>
                  {perturbations.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ x: -20, opacity: 0, scale: 0.95 }}
                      animate={{
                        x: 0,
                        opacity: 1,
                        scale: 1,
                        borderColor: activePerturbation === p.id ? 'rgba(255, 255, 0, 0.6)' : 'rgba(255, 255, 0, 0.2)'
                      }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-black/40 border rounded-lg p-2 backdrop-blur-sm"
                      style={{
                        boxShadow: activePerturbation === p.id ? '0 0 20px rgba(255, 255, 0, 0.3)' : 'none'
                      }}
                    >
                      <div className="flex items-start gap-2 mb-1">
                        <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="text-xs text-gray-400">
                              {new Date(p.timestamp).toLocaleTimeString()}
                            </div>
                            {p.judgeType === 'llm' && (
                              <div className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded border border-purple-500/30">
                                🧠 LLM Judge
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-red-400 font-medium mb-1">
                            {p.failureMode}
                          </div>
                          {p.observation && (
                            <div className="text-xs text-gray-400 mb-1 italic">
                              "{p.observation}"
                            </div>
                          )}
                          {p.reasoning && (
                            <div className="text-xs text-yellow-300 mb-1">
                              💡 {p.reasoning}
                            </div>
                          )}
                          <div className="text-xs text-cyan-300 leading-relaxed">
                            → {p.prompt}
                          </div>
                          {p.difficulty !== undefined && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs text-gray-500">Difficulty:</span>
                              <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden max-w-[100px]">
                                <div
                                  className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                                  style={{ width: `${p.difficulty * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">{(p.difficulty * 100).toFixed(0)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {perturbations.length === 0 && (
                  <div className="text-xs text-gray-600 text-center py-8">
                    Monitoring for failure patterns...
                  </div>
                )}
              </div>
            </div>

            {/* Metrics Visualization */}
            <div className="flex-1 p-4">
              <div className="h-full bg-black/20 rounded-lg border border-gray-800 p-3 relative overflow-hidden">
                {/* Dynamic line chart visualization */}
                <div className="absolute inset-0 flex items-end justify-around p-3 gap-1">
                  {metrics.slice(-30).map((m, idx) => {
                    const heightPercent = Math.max(5, Math.min(95, (m.success_rate * 100)));
                    const color = m.success_rate > 0.7 ? 'from-green-400 to-cyan-400' :
                                  m.success_rate > 0.4 ? 'from-cyan-400 to-yellow-400' :
                                  'from-yellow-400 to-red-400';

                    return (
                      <div
                        key={idx}
                        className={`w-full bg-gradient-to-t ${color} rounded-t transition-all duration-500 ease-out`}
                        style={{
                          height: `${heightPercent}%`,
                          opacity: 0.4 + (idx / 30) * 0.6,
                          transform: `scaleY(${0.8 + (idx / 30) * 0.2})`
                        }}
                      />
                    );
                  })}
                </div>

                {/* Animated grid overlay */}
                <div className="absolute inset-0 opacity-10">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-full border-t border-cyan-400"
                      style={{ bottom: `${i * 25}%` }}
                    />
                  ))}
                </div>

                {/* Y-axis labels */}
                <div className="absolute left-1 top-2 bottom-2 flex flex-col justify-between text-xs text-gray-600">
                  <span>100%</span>
                  <span>75%</span>
                  <span>50%</span>
                  <span>25%</span>
                  <span>0%</span>
                </div>

                {/* Current success rate indicator */}
                {metrics.length > 0 && (
                  <div
                    className="absolute right-4 bg-cyan-400/20 border-l-2 border-cyan-400 px-2 py-1 rounded transition-all duration-500"
                    style={{ bottom: `${Math.max(5, metrics[metrics.length - 1].success_rate * 100)}%` }}
                  >
                    <span className="text-xs font-bold text-cyan-400">
                      {(metrics[metrics.length - 1].success_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                )}

                <div className="relative z-10 text-xs text-gray-500">
                  Success Rate Over Time ({metrics.length} episodes)
                </div>
              </div>
            </div>
          </div>

          {/* Connection visualization pulse */}
          {activePerturbation && (
            <>
              <motion.div
                initial={{ left: '40%', opacity: 0 }}
                animate={{
                  left: ['40%', '0%'],
                  opacity: [0, 1, 0]
                }}
                transition={{ duration: 1.5 }}
                className="absolute top-1/2 w-2 h-2 bg-yellow-400 rounded-full blur-sm"
              />
              <motion.div
                initial={{ right: '60%', opacity: 0 }}
                animate={{
                  right: ['60%', '0%'],
                  opacity: [0, 1, 0]
                }}
                transition={{ duration: 1.5 }}
                className="absolute top-1/2 w-2 h-2 bg-yellow-400 rounded-full blur-sm"
              />
            </>
          )}
        </motion.div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700;900&family=JetBrains+Mono:wght@400;700&display=swap');

        body {
          font-family: 'JetBrains Mono', monospace;
        }

        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(0, 255, 255, 0.3);
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
}
