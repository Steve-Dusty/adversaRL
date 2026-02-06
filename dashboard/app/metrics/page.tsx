'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Activity, TrendingUp, Target, Zap, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const generateRewardData = (length: number) => {
  return Array.from({ length }, (_, i) => ({
    episode: i,
    reward: Math.sin(i / 10) * 50 + Math.random() * 20 + (i * 0.5),
    baseline: i * 0.3,
    odyssey: i * 0.5 + Math.random() * 10,
  }));
};

const generateSuccessData = (length: number) => {
  return Array.from({ length }, (_, i) => ({
    episode: i,
    rate: Math.min(95, (i / length) * 100 + Math.random() * 10),
  }));
};

export default function MetricsPage() {
  const [metrics, setMetrics] = useState({
    successRate: 0,
    avgReward: 0,
    episodes: 0,
  });
  const [rewardData, setRewardData] = useState(generateRewardData(50));
  const [successData, setSuccessData] = useState(generateSuccessData(50));

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'metrics') {
        const data = message.data;
        setMetrics({
          successRate: data.success_rate,
          avgReward: data.avg_reward,
          episodes: data.episodes,
        });

        setRewardData(prev => {
          const newData = [...prev.slice(-49)];
          newData.push({
            episode: data.episodes,
            reward: data.avg_reward,
            baseline: data.episodes * 0.3,
            odyssey: data.avg_reward,
          });
          return newData;
        });

        setSuccessData(prev => {
          const newData = [...prev.slice(-49)];
          newData.push({
            episode: data.episodes,
            rate: data.success_rate,
          });
          return newData;
        });
      }
    };

    return () => ws.close();
  }, []);

  const radarData = [
    { skill: 'Lighting', baseline: 65, odyssey: 92 },
    { skill: 'Occlusion', baseline: 45, odyssey: 85 },
    { skill: 'Color', baseline: 70, odyssey: 88 },
    { skill: 'Clutter', baseline: 50, odyssey: 90 },
    { skill: 'Overall', baseline: 58, odyssey: 89 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-cyan-500/20 backdrop-blur-xl bg-black/40 p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/stream">
              <button className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition">
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-mono">Back to Stream</span>
              </button>
            </Link>
            <h1 className="text-2xl font-bold tracking-wider" style={{ fontFamily: 'Orbitron, monospace' }}>
              TRAINING METRICS
            </h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {[
            { label: 'Success Rate', value: `${metrics.successRate.toFixed(1)}%`, icon: Target, color: 'cyan' },
            { label: 'Avg Reward', value: metrics.avgReward.toFixed(1), icon: TrendingUp, color: 'green' },
            { label: 'Episodes', value: metrics.episodes, icon: Activity, color: 'purple' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-black/80 backdrop-blur-xl border border-gray-700 rounded-xl p-6"
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-6 h-6 text-${stat.color}-400`} />
                <div className={`text-3xl font-bold text-${stat.color}-400`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {stat.value}
                </div>
              </div>
              <p className="text-sm text-gray-400 font-mono">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-6">
          {/* Reward Trajectory */}
          <div className="bg-black/80 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              <span className="font-mono text-sm tracking-wider text-cyan-400">REWARD TRAJECTORY</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={rewardData}>
                <defs>
                  <linearGradient id="colorOdyssey" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="episode" stroke="#6b7280" style={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #06b6d4', borderRadius: 8 }} />
                <Area type="monotone" dataKey="odyssey" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorOdyssey)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Success Rate */}
          <div className="bg-black/80 backdrop-blur-xl border border-green-500/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-5 h-5 text-green-400" />
              <span className="font-mono text-sm tracking-wider text-green-400">SUCCESS RATE</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={successData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="episode" stroke="#6b7280" style={{ fontSize: 10 }} />
                <YAxis stroke="#6b7280" domain={[0, 100]} style={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #10b981', borderRadius: 8 }} />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Robustness Radar */}
          <div className="bg-black/80 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-5 h-5 text-purple-400" />
              <span className="font-mono text-sm tracking-wider text-purple-400">ROBUSTNESS ANALYSIS</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="skill" stroke="#9ca3af" style={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#6b7280" />
                <Radar name="Baseline" dataKey="baseline" stroke="#6b7280" fill="#6b7280" fillOpacity={0.3} />
                <Radar name="Odyssey" dataKey="odyssey" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Orbitron:wght@700;900&display=swap');
      `}</style>
    </div>
  );
}
