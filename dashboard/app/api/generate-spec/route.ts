import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SPEC_GENERATION_PROMPT = `You are a robotics training assistant for AdversaRL, a system that uses Odyssey's world model for domain randomization.

Given a user's training goal, generate a structured training specification that includes:
1. Task type and success criteria
2. Odyssey environment prompt (natural language description of the scene)
3. Domain randomization strategy (what to perturb: lighting, occlusion, texture, etc.)
4. A brief explanation for the user

Response format (JSON):
{
  "spec": {
    "task_type": "string",
    "success_criteria": "string",
    "environment_prompt": "string (detailed Odyssey prompt)",
    "perturbations": ["array", "of", "perturbation", "types"],
    "action_space": "6dof_end_effector",
    "observation": "rgb_camera_720p",
    "episode_length": 50,
    "reward_structure": {
      "success": 1.0,
      "step_penalty": -0.01,
      "distance_shaping": true
    }
  },
  "explanation": "string (friendly explanation of what we'll train)"
}

Key guidelines:
- Odyssey prompts should be vivid, specific, visual descriptions
- Perturbations should target sim-to-real gap issues (lighting, texture, occlusion, clutter)
- Keep explanations user-friendly, not overly technical
- Focus on robotic manipulation tasks`;

export async function POST(req: NextRequest) {
  try {
    const { goal } = await req.json();

    if (!goal || typeof goal !== 'string') {
      return NextResponse.json(
        { error: 'Goal is required' },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SPEC_GENERATION_PROMPT },
        { role: 'user', content: `User's training goal: ${goal}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error generating spec:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate specification' },
      { status: 500 }
    );
  }
}
