"""
LLM-as-Judge Curriculum Controller
Uses OpenAI GPT-4 to watch the training process and generate adaptive curriculum prompts
ALL TEXT IS LLM-GENERATED - NO HARDCODED FAILURE MODES OR PROMPTS
"""

import openai
import base64
import os
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class JudgmentResult:
    """Result from LLM judge evaluation"""
    timestamp: datetime
    observation: str  # What the LLM observed
    failure_mode: Optional[str]  # Detected failure pattern
    reasoning: str  # Why this is a weakness
    curriculum_prompt: Optional[str]  # Prompt to send to Odyssey
    difficulty_level: float  # 0-1, how hard the challenge should be


class LLMJudge:
    """
    Watches the RL training process and generates adaptive curriculum prompts.
    Uses GPT-4 Vision to evaluate agent performance and target weaknesses.
    """

    def __init__(
        self,
        openai_api_key: str,
        model: str = "gpt-4o",
        difficulty_progression: float = 0.1,
        training_context: Optional[Dict] = None
    ):
        self.client = openai.OpenAI(api_key=openai_api_key)
        self.model = model
        self.difficulty = 0.3  # Start moderate
        self.difficulty_progression = difficulty_progression
        self.training_context = training_context or {}

        self.evaluation_history: List[JudgmentResult] = []
        self.success_window: List[bool] = []  # Last N episodes
        self.window_size = 10

    def evaluate_performance(
        self,
        frame_base64: Optional[str],
        success_rate: float,
        recent_failures: List[str],
        episode_num: int
    ) -> JudgmentResult:
        """
        Main evaluation method - LLM judges current training state

        Args:
            frame_base64: Base64-encoded frame from Odyssey stream (can be None for simulation)
            success_rate: Current rolling success rate
            recent_failures: Descriptions of recent failure episodes
            episode_num: Current episode number

        Returns:
            JudgmentResult with LLM's assessment and curriculum recommendation
        """

        # Build context for the LLM
        failure_context = "\n".join([f"- {f}" for f in recent_failures[-5:]]) if recent_failures else "No recent failures"

        # Build training context section
        context_section = ""
        if self.training_context:
            context_section = f"""
**Training Goal:**
- Task Type: {self.training_context.get('task_type', 'Manipulation')}
- Success Criteria: {self.training_context.get('success_criteria', 'Task completion')}
- Base Environment: {self.training_context.get('environment', 'Robot workspace')}
- Allowed Perturbations: {', '.join(self.training_context.get('perturbations', ['lighting', 'occlusion']))}
"""

        system_prompt = f"""You are an expert RL curriculum designer watching a robotic manipulation task training in Odyssey (a world model simulator).

Your job is to:
1. Observe what's happening in the training environment
2. Identify weaknesses in the agent's performance
3. Design targeted curriculum challenges to make the agent more robust

You have access to:
- The user's original training goal and specifications
- Current success rate
- Recent failure episodes
- (Optional) Visual frame from the Odyssey environment

Use adversarial curriculum learning principles - target the agent's specific weaknesses with progressively harder challenges.
{context_section}"""

        user_prompt = f"""**Current Training State:**
- Episode: {episode_num}
- Success Rate (last {self.window_size} episodes): {success_rate:.1%}
- Current Difficulty: {self.difficulty:.1f}/1.0

**Recent Failures:**
{failure_context}

**Task:** Analyze the current training state and generate a curriculum intervention.

**Your Response Must Include:**
1. **observation**: Brief description of what you observe about the agent's current behavior and performance patterns
2. **failure_mode**: The specific weakness or failure pattern you detect (e.g., "struggles with occluded objects", "poor grasp force control")
3. **reasoning**: 1-2 sentences explaining why this weakness exists and how it limits the agent
4. **curriculum_prompt**: A specific, creative natural language prompt to send to Odyssey that creates a targeted challenge. Be visual and specific (Odyssey can: change lighting, add fog, add objects, change materials, add occlusions, change colors, add motion blur, etc.)
5. **difficulty_adjustment**: A number between -0.1 and +0.1 indicating how much to change difficulty

**Guidelines:**
- If success rate > 80%: Introduce NEW challenges to push the agent further
- If success rate 50-80%: Maintain difficulty, vary the challenges
- If success rate < 50%: Make challenges slightly easier or more gradual
- Be creative with Odyssey prompts - think cinematically
- Target SPECIFIC weaknesses, not generic difficulty

Respond ONLY with valid JSON (no markdown):
{{
  "observation": "...",
  "failure_mode": "...",
  "reasoning": "...",
  "curriculum_prompt": "...",
  "difficulty_adjustment": 0.0
}}"""

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]

            # If we have a frame, add it (for when we have real Odyssey frames)
            # For now, we simulate without actual frames
            # if frame_base64:
            #     messages[1]["content"] = [
            #         {"type": "text", "text": user_prompt},
            #         {
            #             "type": "image_url",
            #             "image_url": {"url": f"data:image/jpeg;base64,{frame_base64}"}
            #         }
            #     ]

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=500,
                temperature=0.7
            )

            # Parse LLM response (expecting JSON)
            import json
            result_text = response.choices[0].message.content

            # Extract JSON from response (handle markdown code blocks)
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            # Update difficulty
            self.difficulty = max(0.1, min(1.0,
                self.difficulty + result.get("difficulty_adjustment", 0)
            ))

            judgment = JudgmentResult(
                timestamp=datetime.now(),
                observation=result.get("observation", ""),
                failure_mode=result.get("failure_mode"),
                reasoning=result.get("reasoning", ""),
                curriculum_prompt=result.get("curriculum_prompt"),
                difficulty_level=self.difficulty
            )

            self.evaluation_history.append(judgment)

            return judgment

        except Exception as e:
            print(f"LLM Judge error: {e}")
            import traceback
            traceback.print_exc()
            # Fallback judgment
            return JudgmentResult(
                timestamp=datetime.now(),
                observation="Unable to evaluate - LLM error occurred",
                failure_mode="llm_evaluation_error",
                reasoning=str(e),
                curriculum_prompt=None,
                difficulty_level=self.difficulty
            )

    def update_success_window(self, success: bool):
        """Track recent success/failure to compute rolling success rate"""
        self.success_window.append(success)
        if len(self.success_window) > self.window_size:
            self.success_window.pop(0)

    def get_success_rate(self) -> float:
        """Compute rolling success rate"""
        if not self.success_window:
            return 0.0
        return sum(self.success_window) / len(self.success_window)

    def get_recent_judgments(self, n: int = 5) -> List[JudgmentResult]:
        """Get last N judgments for display"""
        return self.evaluation_history[-n:]


# Example usage:
if __name__ == "__main__":
    import os

    # Test with OpenAI
    judge = LLMJudge(
        openai_api_key=os.getenv("OPENAI_API_KEY", "")
    )

    # Simulate evaluation
    result = judge.evaluate_performance(
        frame_base64=None,
        success_rate=0.45,
        recent_failures=[
            "Failed to grasp cube - slipped",
            "Failed to detect cube - poor lighting",
            "Collided with table edge"
        ],
        episode_num=50
    )

    print(f"Observation: {result.observation}")
    print(f"Failure Mode: {result.failure_mode}")
    print(f"Reasoning: {result.reasoning}")
    print(f"Curriculum Prompt: {result.curriculum_prompt}")
    print(f"Difficulty: {result.difficulty_level:.2f}")
