# Goal Input Feature - ChatGPT-Style Training Setup

## Overview

The Goal Input page provides a **ChatGPT-style interface** for setting up robot training specifications. Instead of manually configuring YAML files, users describe their training goal in natural language, and OpenAI GPT-4 generates a complete training specification.

## Flow

```
┌──────────────────────────────────────────────────────┐
│  1. User enters goal in natural language            │
│     "I want the robot to pick up objects..."         │
└─────────────────────┬────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│  2. OpenAI generates training specification          │
│     • Task type & success criteria                   │
│     • Odyssey environment prompt                     │
│     • Domain randomization strategy                  │
│     • Reward structure                               │
└─────────────────────┬────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│  3. User can refine specification                    │
│     Click "Refine Specification" for clarifications  │
└─────────────────────┬────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│  4. Start training                                   │
│     Spec saved → Training begins → Redirects to      │
│     stream page with Odyssey + LLM curriculum        │
└──────────────────────────────────────────────────────┘
```

## Files Created

### Frontend (Next.js)
- **`dashboard/app/goal/page.tsx`** - ChatGPT-style goal input page
- **`dashboard/app/api/generate-spec/route.ts`** - API route for spec generation
- **`dashboard/app/api/clarify-spec/route.ts`** - API route for refinement
- **`dashboard/app/api/start-training/route.ts`** - API route to start training

### Backend (Python)
- **`adversarl/specification/spec_loader.py`** - Load/validate training specs
- **`adversarl/specification/__init__.py`** - Module exports

### Integration
- **`main.py`** - Updated to load spec and pass to LLM judge
- **`adversarl/curriculum/llm_judge.py`** - Updated to use training context

## Usage

### 1. Set OpenAI API Key

Make sure your `.env` file has:
```bash
OPENAI_API_KEY=sk-your-key-here
```

### 2. Start the Dashboard

```bash
cd dashboard
npm run dev
```

Navigate to `http://localhost:3000` - you'll be automatically redirected to `/goal`

### 3. Enter Your Goal

Example prompts:
- "Train the robot to pick up red blocks and stack them"
- "Teach the robot to grasp objects from a cluttered table"
- "Make the robot able to place items into a target box"

### 4. Review Generated Spec

OpenAI will generate:
- **Task Type**: e.g., "tabletop_pick_and_place"
- **Success Criteria**: e.g., "Object placed within 5cm tolerance"
- **Environment Prompt**: Vivid description for Odyssey (e.g., "Robot arm on white table with red cube, workshop lighting...")
- **Perturbations**: Domain randomization targets (lighting, occlusion, texture, clutter)

### 5. Refine (Optional)

Click **"Refine Specification"** to:
- Get clarifying questions from the AI
- Adjust success criteria
- Modify environment details
- Change perturbation focus

### 6. Start Training

Click **"Start Training"** to:
1. Save spec to `config/training_spec.json`
2. Backend loads spec on startup
3. LLM judge uses spec context for targeted curriculum
4. Redirects to stream page with live training

## Example Spec Generated

**Input:** "I want the robot to pick up objects and place them in a box"

**Generated Spec:**
```json
{
  "task_type": "pick_and_place_manipulation",
  "success_criteria": "Object placed in target box within 5cm tolerance",
  "environment_prompt": "Robot arm workspace with white table, various household objects (cups, blocks, toys), and a cardboard target box on the right side. Clean workshop lighting, industrial setting.",
  "perturbations": ["lighting", "occlusion", "texture", "clutter"],
  "action_space": "6dof_end_effector",
  "observation": "rgb_camera_720p",
  "episode_length": 50,
  "reward_structure": {
    "success": 1.0,
    "step_penalty": -0.01,
    "distance_shaping": true
  }
}
```

## How It Integrates with Training

### Specification Flow

```
User Goal → OpenAI GPT-4 → training_spec.json → Backend Loads → LLM Judge Uses Context
```

### Backend Integration

In `main.py`:
```python
# Load user's specification
spec = load_training_spec()

# Pass to LLM judge for context-aware curriculum
llm_judge = LLMJudge(
    openai_api_key=api_key,
    training_context={
        "task_type": spec.task_type,
        "success_criteria": spec.success_criteria,
        "environment": spec.environment_prompt,
        "perturbations": spec.perturbations
    }
)
```

### LLM Judge with Context

The LLM judge now generates curriculum prompts **specific to your goal**:

- If training "pick and place in box" → curriculum focuses on box placement accuracy, grasp stability
- If training "stack blocks" → curriculum focuses on stacking precision, vertical alignment
- Environment prompts stay consistent with your specified base environment

## Design

### ChatGPT-Style Theme
- Dark background (`#0a0a0f`)
- Cyan/purple gradients for accents
- Message bubbles (user: cyan, assistant: gray)
- Smooth animations with Framer Motion
- Typing indicator during AI processing

### Example Prompts
Pre-filled suggestions to inspire users:
- "Pick up red blocks and stack them vertically"
- "Grasp objects from a cluttered table"
- "Place items into a target box accurately"
- "Navigate and grasp moving objects"

## API Endpoints

### POST `/api/generate-spec`
**Body:**
```json
{ "goal": "User's natural language goal" }
```

**Response:**
```json
{
  "spec": { ... training specification ... },
  "explanation": "Friendly explanation of what we'll train"
}
```

### POST `/api/clarify-spec`
**Body:**
```json
{
  "goal": "Original goal",
  "currentSpec": { ... current spec ... }
}
```

**Response:**
```json
{
  "clarification": "Conversational message with questions",
  "spec": { ... refined spec ... },
  "suggestions": ["array of improvements"]
}
```

### POST `/api/start-training`
**Body:**
```json
{ "spec": { ... final spec ... } }
```

**Response:**
```json
{
  "success": true,
  "config_path": "/path/to/training_spec.json"
}
```

## Benefits

1. **No YAML editing** - Everything configured via natural language
2. **Context-aware curriculum** - LLM judge knows your specific goal
3. **Faster setup** - Seconds instead of minutes/hours
4. **Better UX** - Familiar ChatGPT interface
5. **Refinement loop** - Iteratively improve spec before training

## Next Steps

- [ ] Add vision upload for reference environments
- [ ] Add spec templates library
- [ ] Add A/B comparison of different specs
- [ ] Add spec sharing/export
- [ ] Integrate with Odyssey batch simulation for spec validation
