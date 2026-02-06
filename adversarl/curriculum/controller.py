"""
Curriculum Controller
Generates adaptive prompts based on agent performance
"""

import anthropic
from typing import List, Dict, Any, Optional


class CurriculumController:
    """
    LLM-powered curriculum controller that generates targeted
    environment perturbations based on agent failures
    """

    def __init__(
        self,
        anthropic_api_key: str,
        model: str = "claude-sonnet-4.5",
        perturbation_categories: Optional[Dict[str, List[str]]] = None
    ):
        """
        Initialize curriculum controller

        Args:
            anthropic_api_key: Claude API key
            model: Claude model to use
            perturbation_categories: Dict of perturbation types and example prompts
        """
        self.client = anthropic.Anthropic(api_key=anthropic_api_key)
        self.model = model
        self.perturbation_categories = perturbation_categories or self._default_perturbations()

    def _default_perturbations(self) -> Dict[str, List[str]]:
        """Default perturbation categories"""
        return {
            "lighting": [
                "switch to harsh overhead fluorescent lighting",
                "dim the lights significantly",
                "add dramatic side lighting with strong shadows",
            ],
            "occlusion": [
                "place a transparent object partially blocking the view",
                "add some clutter near the target",
            ],
            "visual": [
                "desaturate the scene",
                "change colors to be more similar",
                "add visual noise to the image",
            ],
            "distraction": [
                "add colorful objects in the background",
                "place similar objects nearby",
            ],
        }

    def generate_perturbation(
        self,
        failure_modes: List[str],
        current_conditions: str,
        success_rate: float
    ) -> str:
        """
        Generate a perturbation prompt based on failure analysis

        Args:
            failure_modes: List of detected failure patterns
            current_conditions: Description of current environment
            success_rate: Current agent success rate (0.0 to 1.0)

        Returns:
            Natural language prompt to send to Odyssey
        """
        # Build prompt for Claude
        prompt = f"""You are an adversarial curriculum designer for reinforcement learning.

Current Environment: {current_conditions}
Agent Success Rate: {success_rate:.1%}
Detected Failure Modes: {', '.join(failure_modes) if failure_modes else 'None yet'}

Your task: Generate a targeted environment perturbation that will challenge the agent's weaknesses.

Available Perturbation Categories:
{self._format_categories()}

Generate a single, specific perturbation prompt (one sentence) that targets the agent's weaknesses.
The perturbation should be challenging but not impossible.

Respond with ONLY the perturbation prompt, nothing else."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}]
        )

        return response.content[0].text.strip()

    def _format_categories(self) -> str:
        """Format perturbation categories for prompt"""
        lines = []
        for category, examples in self.perturbation_categories.items():
            lines.append(f"- {category.title()}: {examples[0]}")
        return "\n".join(lines)

    def select_perturbation(
        self,
        failure_category: str,
        intensity: float = 0.5
    ) -> str:
        """
        Select a perturbation from a specific category

        Args:
            failure_category: Category to select from
            intensity: Perturbation intensity (0.0 to 1.0)

        Returns:
            Perturbation prompt
        """
        if failure_category not in self.perturbation_categories:
            failure_category = list(self.perturbation_categories.keys())[0]

        prompts = self.perturbation_categories[failure_category]
        import random
        return random.choice(prompts)
