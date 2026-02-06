import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CLARIFICATION_PROMPT = `You are a robotics training assistant helping refine training specifications.

Given a user's goal and current specification, provide:
1. 2-3 clarifying questions to make the specification more precise
2. Suggested improvements to the spec based on best practices
3. Updated specification incorporating refinements

Be conversational and helpful. Focus on:
- What objects/scenarios to train on
- Success criteria precision
- Domain randomization priorities
- Training duration and difficulty progression

Response format (JSON):
{
  "clarification": "string (conversational message with questions and suggestions)",
  "spec": { ... updated spec ... },
  "suggestions": ["array", "of", "specific", "improvements"]
}`;

export async function POST(req: NextRequest) {
  try {
    const { goal, currentSpec } = await req.json();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CLARIFICATION_PROMPT },
        {
          role: 'user',
          content: `Original goal: ${goal}\n\nCurrent spec:\n${JSON.stringify(currentSpec.spec, null, 2)}\n\nHelp me refine this specification.`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error clarifying spec:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clarify specification' },
      { status: 500 }
    );
  }
}
