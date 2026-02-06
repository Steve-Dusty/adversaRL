'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Brain, Target, TrendingUp, Zap, Clock, Award, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface MetricPoint {
  episode: number;
  success_rate: number;
  reward: number;
  timestamp: number;
}

interface CurriculumEvent {
  id: string;
  episode: number;
  failure_mode: string;
  observation: string;
  reasoning: string;
  curriculum_prompt: string;
  difficulty: number;
  timestamp: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [curriculumEvents, setCurriculumEvents] = useState<CurriculumEvent[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [currentSuccessRate, setCurrentSuccessRate] = useState(0);
  const [currentReward, setCurrentReward] = useState(0);
  const [avgDifficulty, setAvgDifficulty] = useState(0);

  useEffect(() => {
    let ws: WebSocket | null = null;

    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws');

        ws.onopen = () => {
          console.log('Dashboard connected to metrics');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.type === 'metrics') {
            const point: MetricPoint = {
              episode: data.episode,
              success_rate: data.success_rate,
              reward: data.reward,
              timestamp: Date.now()
            };

            setMetrics(prev => [...prev.slice(-100), point]);
            setCurrentEpisode(data.episode);
            setCurrentSuccessRate(data.success_rate);
            setCurrentReward(data.reward);
          }

          if (data.type === 'perturbation') {
            const event: CurriculumEvent = {
              id: Date.now().toString(),
              episode: currentEpisode,
              failure_mode: data.failure_mode,
              observation: data.observation,
              reasoning: data.reasoning,
              curriculum_prompt: data.curriculum_prompt || data.prompt,
              difficulty: data.difficulty || 0.5,
              timestamp: Date.now()
            };

            setCurriculumEvents(prev => [event, ...prev.slice(0, 19)]);

            // Update average difficulty
            const allDifficulties = [...curriculumEvents.map(e => e.difficulty), event.difficulty];
            setAvgDifficulty(allDifficulties.reduce((a, b) => a + b, 0) / allDifficulties.length);
          }
        };

        ws.onerror = () => {
          setTimeout(connect, 2000);
        };

        ws.onclose = () => {
          setTimeout(connect, 2000);
        };
      } catch (error) {
        setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      if (ws) ws.close();
    };
  }, [currentEpisode, curriculumEvents]);

  const recentMetrics = metrics.slice(-20);
  const maxReward = Math.max(...metrics.map(m => m.reward), 1);
  const totalInterventions = curriculumEvents.length;
  const avgSuccessRate = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.success_rate, 0) / metrics.length
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white font-mono">
      {/* Header */}
      <div className="border-b border-cyan-500/30 bg-black/90 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-wider" style={{ fontFamily: 'Rajdhani, monospace' }}>
                ADVERSA<span className="text-cyan-400">RL</span>
              </h1>
              <p className="text-sm text-gray-400 mt-1">Training Analytics Dashboard</p>
            </div>

            <Link href="/stream">
              <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg transition">
                <Activity className="w-4 h-4" />
                <span className="text-sm">Live Command Center</span>
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Current Episode */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-cyan-950/30 to-black border border-cyan-500/30 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <Clock className="w-8 h-8 text-cyan-400" />
              <div className="text-right">
                <div className="text-3xl font-bold text-cyan-400">{currentEpisode}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider">Episodes</div>
              </div>
            </div>
          </motion.div>

          {/* Success Rate */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-green-950/30 to-black border border-green-500/30 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <Award className="w-8 h-8 text-green-400" />
              <div className="text-right">
                <div className="text-3xl font-bold text-green-400">
                  {(currentSuccessRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wider">Success Rate</div>
              </div>
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${currentSuccessRate * 100}%` }}
              />
            </div>
          </motion.div>

          {/* Current Reward */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-yellow-950/30 to-black border border-yellow-500/30 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <TrendingUp className="w-8 h-8 text-yellow-400" />
              <div className="text-right">
                <div className="text-3xl font-bold text-yellow-400">
                  {currentReward.toFixed(2)}
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wider">Current Reward</div>
              </div>
            </div>
          </motion.div>

          {/* LLM Interventions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-magenta-950/30 to-black border border-magenta-500/30 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <Brain className="w-8 h-8 text-magenta-400" />
              <div className="text-right">
                <div className="text-3xl font-bold text-magenta-400">{totalInterventions}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider">LLM Interventions</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Success Rate Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-black/60 border border-cyan-500/30 rounded-lg p-6 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-cyan-400">Success Rate Over Time</h2>
              <div className="text-xs text-gray-400">
                Avg: {(avgSuccessRate * 100).toFixed(1)}%
              </div>
            </div>

            <div className="h-64 relative">
              {/* Grid lines */}
              <div className="absolute inset-0">
                {[0, 0.25, 0.5, 0.75, 1].map((val) => (
                  <div
                    key={val}
                    className="absolute w-full border-t border-gray-800"
                    style={{ bottom: `${val * 100}%` }}
                  >
                    <span className="absolute -left-10 -top-2 text-xs text-gray-600">
                      {(val * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Line chart */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="successGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#00ffff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#00ffff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {recentMetrics.length > 1 && (
                  <>
                    <polyline
                      fill="url(#successGradient)"
                      stroke="none"
                      points={
                        recentMetrics
                          .map((m, i) => {
                            const x = (i / (recentMetrics.length - 1)) * 100;
                            const y = 100 - m.success_rate * 100;
                            return `${x},${y}`;
                          })
                          .join(' ') + ` 100,100 0,100`
                      }
                    />
                    <polyline
                      fill="none"
                      stroke="#00ffff"
                      strokeWidth="2"
                      points={recentMetrics
                        .map((m, i) => {
                          const x = (i / (recentMetrics.length - 1)) * 100;
                          const y = 100 - m.success_rate * 100;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                  </>
                )}
              </svg>
            </div>
          </motion.div>

          {/* Reward Chart */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-black/60 border border-yellow-500/30 rounded-lg p-6 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-yellow-400">Reward Trajectory</h2>
              <div className="text-xs text-gray-400">
                Max: {maxReward.toFixed(2)}
              </div>
            </div>

            <div className="h-64 flex items-end justify-around gap-1">
              {recentMetrics.map((m, i) => {
                const height = Math.max(5, (m.reward / maxReward) * 100);
                const isRecent = i >= recentMetrics.length - 5;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t transition-all duration-300"
                    style={{
                      height: `${height}%`,
                      background: isRecent
                        ? 'linear-gradient(to top, #facc15, #fbbf24)'
                        : 'linear-gradient(to top, #854d0e, #ca8a04)',
                      opacity: 0.3 + (i / recentMetrics.length) * 0.7
                    }}
                  />
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Curriculum Events Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-black/60 border border-magenta-500/30 rounded-lg p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Brain className="w-6 h-6 text-magenta-400" />
              <h2 className="text-lg font-bold text-magenta-400">LLM-Generated Curriculum Timeline</h2>
            </div>
            <div className="text-xs text-gray-400">
              Avg Difficulty: {(avgDifficulty * 100).toFixed(0)}%
            </div>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {curriculumEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Waiting for LLM curriculum interventions...</p>
              </div>
            ) : (
              curriculumEvents.map((event, idx) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-gradient-to-r from-magenta-950/20 to-transparent border border-magenta-500/20 rounded-lg p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-magenta-500/20 border-2 border-magenta-500/40 flex items-center justify-center">
                        <Target className="w-6 h-6 text-magenta-400" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-gray-400">
                          Episode {event.episode} • {new Date(event.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-gray-500">Difficulty:</div>
                          <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                              style={{ width: `${event.difficulty * 100}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-400">{(event.difficulty * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      <div className="text-sm font-medium text-red-400 mb-2">
                        {event.failure_mode}
                      </div>

                      {event.observation && (
                        <div className="text-xs text-gray-400 mb-2 italic">
                          "{event.observation}"
                        </div>
                      )}

                      {event.reasoning && (
                        <div className="text-xs text-yellow-300 mb-2">
                          💡 {event.reasoning}
                        </div>
                      )}

                      <div className="text-xs text-cyan-300 bg-black/30 border border-cyan-500/20 rounded px-3 py-2">
                        → {event.curriculum_prompt}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700;900&family=JetBrains+Mono:wght@400;700&display=swap');

        ::-webkit-scrollbar {
          width: 6px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(255, 0, 255, 0.3);
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 0, 255, 0.5);
        }
      `}</style>
    </div>
  );
}
