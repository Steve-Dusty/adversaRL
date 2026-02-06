"""
Curriculum Strategies
Different strategies for adaptive curriculum generation
"""

from typing import List, Dict
import random


class CurriculumStrategy:
    """Base class for curriculum strategies"""

    def select_perturbation(
        self,
        failure_modes: List[str],
        success_rate: float,
        categories: Dict[str, List[str]]
    ) -> str:
        """Select a perturbation based on strategy"""
        raise NotImplementedError


class RandomStrategy(CurriculumStrategy):
    """Randomly select perturbations"""

    def select_perturbation(
        self,
        failure_modes: List[str],
        success_rate: float,
        categories: Dict[str, List[str]]
    ) -> str:
        """Randomly select a perturbation"""
        all_perturbations = []
        for perturbations in categories.values():
            all_perturbations.extend(perturbations)
        return random.choice(all_perturbations)


class TargetedStrategy(CurriculumStrategy):
    """Target specific failure modes"""

    def select_perturbation(
        self,
        failure_modes: List[str],
        success_rate: float,
        categories: Dict[str, List[str]]
    ) -> str:
        """Select perturbation targeting weaknesses"""
        if failure_modes:
            # Target the most common failure mode
            category = failure_modes[0]
            if category in categories:
                return random.choice(categories[category])

        # Fallback to random
        return RandomStrategy().select_perturbation(failure_modes, success_rate, categories)


class ProgressiveStrategy(CurriculumStrategy):
    """Progressively increase difficulty"""

    def select_perturbation(
        self,
        failure_modes: List[str],
        success_rate: float,
        categories: Dict[str, List[str]]
    ) -> str:
        """Select perturbation based on current success rate"""
        # Start easy, get harder as agent improves
        if success_rate < 0.3:
            # Easy perturbations
            category = "visual"
        elif success_rate < 0.6:
            # Medium perturbations
            category = "lighting"
        else:
            # Hard perturbations
            category = "occlusion"

        if category in categories:
            return random.choice(categories[category])

        return RandomStrategy().select_perturbation(failure_modes, success_rate, categories)
