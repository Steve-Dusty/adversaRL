#!/usr/bin/env python3
"""
AdversaRL Backend - WebSocket Server with LLM-as-Judge Curriculum
Provides real-time training data, agent state, and LLM-driven curriculum events to the dashboard
"""

import asyncio
import json
import random
import math
import os
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pathlib import Path
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add adversarl to path
sys.path.insert(0, str(Path(__file__).parent))
from adversarl.curriculum.llm_judge import LLMJudge, JudgmentResult
from adversarl.specification import load_training_spec, SpecificationError

app = FastAPI(title="AdversaRL Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TrainingSimulator:
    """Simulates RL training progress with LLM-driven adaptive curriculum"""

    def __init__(self, use_llm_judge: bool = False):
        self.episode = 0
        self.success_rate = 0.0
        self.base_reward = 0.0
        self.curriculum_phase = 0
        self.recent_failures = []

        # Load training specification from goal input
        self.spec = None
        try:
            self.spec = load_training_spec()
            print(f"✅ Training specification loaded:")
            print(f"   Task: {self.spec.task_type}")
            print(f"   Environment: {self.spec.environment_prompt[:60]}...")
            print(f"   Perturbations: {', '.join(self.spec.perturbations)}")
        except SpecificationError as e:
            print(f"⚠️  No training spec found: {e}")
            print("   Using default specification")

        # Initialize LLM judge if API key available
        self.llm_judge = None
        self.use_llm_judge = use_llm_judge
        if use_llm_judge:
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                # Pass spec context to LLM judge
                spec_context = None
                if self.spec:
                    spec_context = {
                        "task_type": self.spec.task_type,
                        "success_criteria": self.spec.success_criteria,
                        "environment": self.spec.environment_prompt,
                        "perturbations": self.spec.perturbations
                    }
                self.llm_judge = LLMJudge(openai_api_key=api_key, training_context=spec_context)
                print("✅ LLM Judge (GPT-4) initialized - ALL curriculum generated dynamically")
            else:
                print("⚠️  OPENAI_API_KEY not found - curriculum disabled")
                self.use_llm_judge = False

    def get_agent_state(self):
        """Generate realistic robot joint angles and state"""
        t = datetime.now().timestamp()

        # Smooth sinusoidal motion for joints (realistic robot movement)
        joints = [
            math.sin(t * 0.3) * 0.5,  # Base rotation
            math.sin(t * 0.2 + 1) * 0.8,  # Shoulder
            math.sin(t * 0.25 + 2) * 0.6,  # Elbow
            math.sin(t * 0.15 + 3) * 0.4,  # Wrist 1
            math.sin(t * 0.18 + 4) * 0.3,  # Wrist 2
            math.sin(t * 0.22 + 5) * 0.2,  # Wrist 3
        ]

        # Calculate end effector position (simplified forward kinematics)
        base_angle = joints[0]
        reach = 0.8 + math.sin(t * 0.2) * 0.2

        end_effector = {
            "x": reach * math.cos(base_angle),
            "y": 0.5 + math.sin(t * 0.3) * 0.2,
            "z": reach * math.sin(base_angle)
        }

        # Gripper state alternates between open/closed
        gripper_state = "closed" if math.sin(t * 0.5) > 0 else "open"

        return {
            "joint_angles": joints,
            "end_effector": end_effector,
            "gripper_state": gripper_state
        }

    def get_metrics(self):
        """Generate training metrics that improve over time"""
        self.episode += 1

        # Success rate improves gradually with noise
        target_success = min(0.95, self.episode / 500)
        self.success_rate += (target_success - self.success_rate) * 0.05
        self.success_rate = max(0, min(1, self.success_rate + random.gauss(0, 0.02)))

        # Reward scales with success rate
        self.base_reward = self.success_rate * 10 + random.gauss(0, 1)

        # Track failures for LLM judge
        episode_success = self.success_rate > 0.5 and random.random() < self.success_rate
        if not episode_success:
            self.recent_failures.append(f"Episode {self.episode}: Failed manipulation task")
            if len(self.recent_failures) > 10:
                self.recent_failures.pop(0)

        # Update LLM judge's success window
        if self.llm_judge:
            self.llm_judge.update_success_window(episode_success)

        return {
            "episode": self.episode,
            "success_rate": self.success_rate,
            "reward": self.base_reward,
            "timestamp": datetime.now().isoformat()
        }

    def should_send_perturbation(self):
        """Decide if curriculum controller should intervene"""
        # Send perturbation every 5-15 episodes for demo (frequent curriculum events)
        if self.episode > 0 and self.episode % random.randint(5, 15) == 0:
            return True
        return False

    async def get_llm_judgment(self, frame_base64: str = "") -> dict:
        """
        Get LLM judge evaluation and curriculum recommendation
        100% LLM-generated - NO HARDCODED TEXT

        In production, frame_base64 would be an actual frame from Odyssey.
        """
        if not self.llm_judge:
            return None

        try:
            success_rate = self.llm_judge.get_success_rate()

            # Call LLM to generate everything dynamically
            judgment = self.llm_judge.evaluate_performance(
                frame_base64=frame_base64,
                success_rate=success_rate,
                recent_failures=self.recent_failures,
                episode_num=self.episode
            )

            return {
                "observation": judgment.observation,
                "failure_mode": judgment.failure_mode,
                "reasoning": judgment.reasoning,
                "curriculum_prompt": judgment.curriculum_prompt,
                "difficulty": judgment.difficulty_level,
                "success_rate": success_rate,
                "timestamp": judgment.timestamp.isoformat(),
                "judge_type": "llm"
            }

        except Exception as e:
            print(f"LLM judgment error: {e}")
            import traceback
            traceback.print_exc()
            return None


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("✅ Dashboard connected to WebSocket")

    # Initialize simulator with LLM judge if available
    simulator = TrainingSimulator(use_llm_judge=True)
    frame_count = 0

    try:
        while True:
            frame_count += 1

            # Send agent state (20 Hz for smooth robot motion)
            agent_state = simulator.get_agent_state()
            await websocket.send_json({
                "type": "agent_state",
                **agent_state
            })

            # Send metrics every 10 frames (~0.5s)
            if frame_count % 10 == 0:
                metrics = simulator.get_metrics()
                await websocket.send_json({
                    "type": "metrics",
                    **metrics
                })

                # Check for curriculum interventions after updating metrics
                if simulator.should_send_perturbation():
                    # ALL curriculum is LLM-generated (no fallback)
                    if simulator.llm_judge:
                        judgment = await simulator.get_llm_judgment()
                        if judgment and judgment['curriculum_prompt']:
                            await websocket.send_json({
                                "type": "perturbation",
                                **judgment
                            })
                            print(f"🧠 LLM Judge: {judgment['failure_mode']}")
                            print(f"   Observation: {judgment['observation'][:50]}...")
                            print(f"   → Curriculum: {judgment['curriculum_prompt'][:60]}...")
                    else:
                        print("⚠️  No LLM judge available - curriculum disabled")

            await asyncio.sleep(0.05)  # 20 Hz update rate

    except WebSocketDisconnect:
        print("❌ Dashboard disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.get("/")
async def root():
    return {
        "service": "AdversaRL Backend",
        "status": "running",
        "websocket": "ws://localhost:8000/ws",
        "description": "Provides training metrics, agent state, and curriculum events"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    print()
    print("="*70)
    print("🚀 AdversaRL Backend - Command Center Data Stream")
    print("="*70)
    print("📡 WebSocket server: ws://localhost:8000/ws")
    print("🌐 HTTP API: http://localhost:8000")
    print()
    print("Streaming:")
    print("  • Training metrics (rewards, success rate)")
    print("  • Agent state (joint angles, end effector position)")
    print("  • Curriculum perturbations (adaptive challenges)")
    print()
    print("="*70)
    print()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
