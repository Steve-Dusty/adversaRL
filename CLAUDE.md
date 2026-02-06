# AdversaRL: Adversarial Sim-to-Real Transfer via World Model Curriculum Training

## What We're Building

A pipeline that uses Odyssey's world model API to generate realistic, dynamically adaptive training environments for reinforcement learning agents — specifically for robotic manipulation tasks. The system exploits Odyssey's real-time prompt-based environment transformation to perform **adversarial curriculum training**, where the environment actively adapts mid-episode to target the agent's weaknesses.

This replaces the traditional domain randomization approach (manually randomizing textures, lighting, physics params in hand-built sims) with language-driven, targeted perturbation powered by a generative world model.

## The Problem

Training RL policies for real-world robots typically happens in simulation (MuJoCo, Isaac Gym, etc.), but these policies fail when deployed on real hardware due to the **sim-to-real gap** — simulated environments look and behave nothing like reality. The current workaround is **domain randomization (DR)**: manually randomizing visual and physics parameters so the agent generalizes. This is tedious to set up (weeks per task), limited to whatever parameters engineers thought to randomize, and wastes training time on easy conditions the agent already handles.

## How Odyssey Solves This

Odyssey (https://odyssey.ml) is a general-purpose world model that generates interactive video simulations from text prompts in real-time. Key capabilities:

- **Real-time generation**: Frames generated every ~50ms (~20 FPS), 720p at 22 FPS
- **Interactive streams**: User/programmatic actions influence the simulation causally (each frame depends only on past frames + actions)
- **Mid-stream text prompts**: You can send natural language instructions during a running simulation and the environment transforms in real-time (e.g., "make it raining", "dim the lights", "add fog")
- **Batch simulations**: Offline generation for parallel training
- **API access**: Python and JavaScript SDKs available

API Docs: https://documentation.api.odyssey.ml/
Blog (architecture details): https://odyssey.ml/the-gpt-2-moment-for-world-models

Three endpoints:
1. **Interactive streams** — real-time, action-conditioned generation
2. **Viewable streams** — real-time generation for observation (no interaction)
3. **Simulations** — offline batch generation

## System Architecture

Three core components in a closed loop:

### 1. RL Training Loop
- Standard RL algorithm (PPO or SAC) via Stable Baselines3 or RLlib
- Visual observations come from Odyssey's interactive stream (frames as image observations)
- Agent outputs actions (manipulation commands)
- Reward signal comes from a vision-based reward detector (classifier on Odyssey frames — e.g., "did the object reach the target position?")
- Needs a **Gym-compatible wrapper** around Odyssey's interactive stream API so it plugs into standard RL frameworks

### 2. Failure Detector
- Monitors the agent's rolling success rate and reward trajectory during training
- Tracks which environmental conditions correlate with failures
- Can start simple: just track reward over time, flag significant drops
- Can evolve to: a classifier that categorizes failure modes (lighting-related, occlusion-related, texture confusion, etc.)
- Outputs structured failure mode descriptions to the curriculum controller

### 3. Curriculum Controller (the key innovation)
- Takes failure detector output and generates natural language prompts to send to Odyssey mid-stream
- Uses an LLM (Claude API) to translate failure patterns into creative environment perturbations
  - Example: "Agent fails when objects are partially occluded" → prompt Odyssey: "place a tall object partially blocking the target"
  - Example: "Agent drops objects under changed lighting" → prompt Odyssey: "switch to harsh fluorescent overhead lighting"
  - Example: "Agent relies too heavily on color cues" → prompt Odyssey: "desaturate the scene, make objects similar colors"
- Alternatively can be rule-based or even a second RL agent that learns to generate maximally challenging environments
- Sends prompts to Odyssey's interactive stream in real-time, transforming the environment while the agent is still operating

### Data Flow
```
Odyssey Interactive Stream → (frames) → RL Agent → (actions) → Odyssey Interactive Stream
                                              ↓
                                        Reward Detector → (reward) → RL Agent
                                              ↓
                                      Failure Detector → (failure modes) → Curriculum Controller
                                                                                   ↓
                                                                          (text prompts) → Odyssey Interactive Stream
```

## Benchmark

Side-by-side comparison of three training conditions on the same manipulation task:

| Condition | Environment Source | Domain Randomization |
|---|---|---|
| **Baseline** | MuJoCo / Isaac Gym | Hand-coded DR (textures, lighting, object positions) |
| **Odyssey Static** | Pre-generated Odyssey environments | Prompt-based variation, fixed during episodes |
| **Odyssey Adaptive** | Live Odyssey stream | Real-time adversarial perturbation targeting agent weaknesses |

### Metrics
- **Grasp/task success rate** on held-out evaluation environments (unseen by all pipelines)
- **Visual generalization score** — performance degradation as visual gap between train/test increases
- **Setup time** — wall clock hours from task description to training running
- **Sample efficiency** — environment steps needed to reach a given success threshold
- **Robustness curve** — success rate as you progressively increase perturbation intensity in eval

### Evaluation Environment
- A neutral test environment that none of the pipelines trained on
- Options: real robot hardware (ideal), photorealistic Isaac Sim scene (proxy), or real video frames with simulated physics overlay
- Must be consistent across all three conditions

## Anchor Task

Start with a single manipulation task: **tabletop object grasping**. Simple enough to benchmark cleanly, complex enough to show the sim-to-real gap.

- Robot arm reaches for and grasps an object on a table surface
- Vary: object type, position, lighting, table surface, clutter, occlusion
- Clear success criterion: object lifted to target height

## Tech Stack

- **RL Framework**: Stable Baselines3 (simpler) or RLlib (better parallelism)
- **Baseline Sim**: MuJoCo via Gymnasium
- **Odyssey Integration**: Odyssey Python SDK → custom Gym-compatible wrapper
- **Curriculum Controller LLM**: Claude API (Sonnet for speed)
- **Reward Detection**: Vision classifier on Odyssey frames (could be a lightweight CNN or a VLM)
- **Experiment Tracking**: Weights & Biases (W&B) for training curves, benchmark metrics, environment screenshots
- **Eval Dashboard**: React app or Streamlit showing benchmark results side-by-side

## Open Questions / Things to Figure Out

1. **Frame extraction from Odyssey**: Can we get individual frames from the interactive stream at each RL timestep? What's the actual latency? Is it fast enough for a real-time training loop, or do we need to pre-generate rollouts in batch mode?
2. **Physics fidelity**: Odyssey hallucinates visuals — does it simulate physics accurately enough for contact/grasp dynamics? If not, we may need a **hybrid approach**: Odyssey for visual observations, MuJoCo for physics simulation underneath. This is still a win because visual DR is the hard part.
3. **Reward extraction**: How do we get reward signals? Options: vision-based reward classifier on frames, external physics engine tracking object state, or prompting Odyssey/using a VLM to assess task completion.
4. **Action space mapping**: How do robot actions (joint torques, end-effector velocities) map to Odyssey's interaction model? Odyssey was designed for navigation-style inputs (WASD, mouse). We may need to define a custom action encoding.
5. **Cost**: Odyssey runs at $1-2/user-hour on H100 clusters. Need to estimate total training cost and see if batch endpoint is cheaper for large-scale runs.
6. **Curriculum controller prompting**: What prompt patterns reliably produce the desired environment transformations in Odyssey? Need to experiment with this.

## Directory Structure (Proposed)

```
adversarl/
├── README.md
├── requirements.txt
├── setup.py
├── config/
│   ├── default.yaml          # Default training hyperparams
│   ├── benchmark.yaml         # Benchmark experiment configs
│   └── odyssey.yaml           # Odyssey API config
├── adversarl/
│   ├── __init__.py
│   ├── envs/
│   │   ├── __init__.py
│   │   ├── odyssey_env.py     # Gym wrapper around Odyssey interactive stream
│   │   ├── odyssey_batch.py   # Batch simulation environment
│   │   └── mujoco_baseline.py # MuJoCo baseline environment with DR
│   ├── curriculum/
│   │   ├── __init__.py
│   │   ├── controller.py      # Curriculum controller (LLM-based prompt generation)
│   │   ├── failure_detector.py # Monitors agent performance, categorizes failures
│   │   └── strategies.py      # Perturbation strategy definitions
│   ├── reward/
│   │   ├── __init__.py
│   │   └── vision_reward.py   # Vision-based reward detection from frames
│   ├── training/
│   │   ├── __init__.py
│   │   ├── train.py           # Main training script
│   │   └── callbacks.py       # Custom SB3/RLlib callbacks for curriculum integration
│   └── benchmark/
│       ├── __init__.py
│       ├── evaluate.py        # Evaluation on held-out environments
│       ├── metrics.py         # Metric computation
│       └── visualize.py       # Generate benchmark comparison plots
├── scripts/
│   ├── run_baseline.sh
│   ├── run_odyssey_static.sh
│   ├── run_odyssey_adaptive.sh
│   └── run_benchmark.sh
├── dashboard/                 # Benchmark visualization dashboard
│   └── app.py
└── tests/
    └── ...
```

## Priority Order

1. Get Odyssey API access, explore the Python SDK, understand the interactive stream API and its constraints
2. Build the Gym wrapper around Odyssey's interactive stream (this is the hardest integration piece)
3. Get a basic RL agent training on Odyssey-generated environments (even without curriculum — just static environments)
4. Set up the MuJoCo baseline with standard DR for comparison
5. Build the failure detector and curriculum controller
6. Run the three-condition benchmark
7. Build the eval dashboard