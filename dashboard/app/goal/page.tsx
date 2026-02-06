'use client';

import { useState, useEffect } from 'react';
import { Send, Sparkles, ArrowRight } from 'lucide-react';
import RobotVisualization from '@/components/RobotVisualization';

export default function GoalInput() {
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);

  // Animated robot state
  const [jointAngles, setJointAngles] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [endEffectorPos, setEndEffectorPos] = useState({ x: 0, y: 0, z: 0 });
  const [gripperState, setGripperState] = useState<'open' | 'closed'>('open');

  // Animate robot joints
  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now() * 0.001;
      setJointAngles([
        Math.sin(t * 0.3) * 0.5,
        Math.sin(t * 0.2 + 1) * 0.8,
        Math.sin(t * 0.25 + 2) * 0.6,
        Math.sin(t * 0.15 + 3) * 0.4,
        Math.sin(t * 0.18 + 4) * 0.3,
        Math.sin(t * 0.22 + 5) * 0.2,
      ]);

      const reach = 0.8 + Math.sin(t * 0.2) * 0.2;
      const baseAngle = jointAngles[0];
      setEndEffectorPos({
        x: reach * Math.cos(baseAngle),
        y: 0.5 + Math.sin(t * 0.3) * 0.2,
        z: reach * Math.sin(baseAngle)
      });

      setGripperState(Math.sin(t * 0.5) > 0 ? 'closed' : 'open');
    }, 50);

    return () => clearInterval(interval);
  }, [jointAngles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;

    setIsLoading(true);
    setMessages([...messages, { role: 'user', content: goal }]);

    try {
      const response = await fetch('/api/generate-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });

      const data = await response.json();
      setSuggestion(data);
      setMessages([
        ...messages,
        { role: 'user', content: goal },
        { role: 'assistant', content: data.explanation }
      ]);
    } catch (error) {
      console.error('Error generating spec:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClarify = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/clarify-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, currentSpec: suggestion }),
      });

      const data = await response.json();
      setMessages([...messages, { role: 'assistant', content: data.clarification }]);
      setSuggestion(data);
    } catch (error) {
      console.error('Error clarifying spec:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTraining = async () => {
    try {
      const response = await fetch('/api/start-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: suggestion }),
      });

      if (response.ok) {
        window.location.href = '/stream';
      }
    } catch (error) {
      console.error('Error starting training:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Header with Robot Model */}
      <div className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold">AdversaRL</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">Training Goal Setup</div>
          </div>
        </div>

        {/* Robot Model Display - Compact */}
        <div className="max-w-4xl mx-auto px-4 pb-4">
          <div className="h-64 rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-950/20 to-purple-950/20 overflow-hidden relative">
            <RobotVisualization
              jointAngles={jointAngles}
              endEffectorPos={endEffectorPos}
              gripperState={gripperState}
            />

            {/* Model name overlay */}
            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md border border-cyan-400/30 rounded-lg px-4 py-2">
              <div className="text-xs text-cyan-400 font-semibold">6-DOF Manipulator</div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="text-center space-y-6 py-12">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
                What do you want to train?
              </h2>
              <p className="text-gray-400 text-lg">
                Describe your robot training goal in natural language
              </p>

              {/* Example prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8">
                {[
                  'Pick up red blocks and stack them vertically',
                  'Grasp objects from a cluttered table',
                  'Place items into a target box accurately',
                  'Navigate and grasp moving objects'
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setGoal(example)}
                    className="p-4 rounded-xl border border-gray-800 hover:border-cyan-400/50 bg-gray-900/50 hover:bg-gray-800/50 text-left transition-all group"
                  >
                    <p className="text-sm text-gray-300 group-hover:text-cyan-400">
                      {example}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-2xl rounded-2xl px-6 py-4 ${
                      msg.role === 'user'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold">U</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Suggestion Card */}
              {suggestion && (
                <div className="mt-8 border border-cyan-400/30 rounded-2xl bg-gray-900/50 p-6 space-y-4">
                  <h3 className="text-xl font-bold text-cyan-400">Training Specification</h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-32">Task Type:</span>
                      <span className="text-white">{suggestion.spec?.task_type || 'Manipulation'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-32">Success Criteria:</span>
                      <span className="text-white">{suggestion.spec?.success_criteria || 'Object placement accuracy'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-32">Environment:</span>
                      <span className="text-white">{suggestion.spec?.environment_prompt || 'Tabletop with objects'}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-800">
                    <h4 className="text-sm font-semibold text-purple-400 mb-2">Domain Randomization</h4>
                    <div className="flex flex-wrap gap-2">
                      {(suggestion.spec?.perturbations || ['lighting', 'occlusion', 'texture']).map((p: string, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-full bg-purple-600/20 text-purple-300 text-xs"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleClarify}
                      disabled={isLoading}
                      className="flex-1 px-6 py-3 rounded-xl border border-cyan-400/50 hover:border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-all disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4 inline mr-2" />
                      Refine Specification
                    </button>
                    <button
                      onClick={handleStartTraining}
                      className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      Start Training
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white animate-pulse" />
                  </div>
                  <div className="max-w-2xl rounded-2xl px-6 py-4 bg-gray-800">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce delay-100" />
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Bar */}
      <div className="border-t border-gray-800 bg-[#0a0a0f] sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Describe your training goal..."
              className="w-full bg-gray-900 text-white rounded-2xl px-6 py-4 pr-14 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400/50 border border-gray-800 focus:border-cyan-400/50"
              rows={1}
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />
            <button
              type="submit"
              disabled={!goal.trim() || isLoading}
              className="absolute right-3 bottom-6 w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Press Enter to send • Shift + Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
