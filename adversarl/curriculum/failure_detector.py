"""
Failure Detector
Monitors agent performance and categorizes failure modes
"""

import numpy as np
from typing import List, Dict, Optional, Deque
from collections import deque


class FailureDetector:
    """
    Tracks agent performance and identifies failure patterns
    """

    def __init__(
        self,
        window_size: int = 100,
        min_success_rate: float = 0.3,
        categories: Optional[List[str]] = None
    ):
        """
        Initialize failure detector

        Args:
            window_size: Number of episodes to track
            min_success_rate: Threshold to trigger adaptation
            categories: List of failure categories to track
        """
        self.window_size = window_size
        self.min_success_rate = min_success_rate
        self.categories = categories or ["lighting", "occlusion", "visual", "distraction"]

        # Performance tracking
        self.episode_rewards: Deque[float] = deque(maxlen=window_size)
        self.episode_successes: Deque[bool] = deque(maxlen=window_size)
        self.episode_lengths: Deque[int] = deque(maxlen=window_size)

        # Failure mode tracking
        self.failure_counts: Dict[str, int] = {cat: 0 for cat in self.categories}
        self.current_conditions: str = "neutral"

    def record_episode(
        self,
        reward: float,
        success: bool,
        length: int,
        conditions: Optional[str] = None
    ):
        """
        Record episode results

        Args:
            reward: Total episode reward
            success: Whether episode was successful
            length: Episode length in steps
            conditions: Current environment conditions
        """
        self.episode_rewards.append(reward)
        self.episode_successes.append(success)
        self.episode_lengths.append(length)

        if conditions:
            self.current_conditions = conditions

        # Track failures by condition
        if not success and conditions:
            # Simple heuristic: map conditions to failure categories
            for category in self.categories:
                if category in conditions.lower():
                    self.failure_counts[category] += 1

    def get_success_rate(self) -> float:
        """Get current success rate"""
        if not self.episode_successes:
            return 0.0
        return sum(self.episode_successes) / len(self.episode_successes)

    def get_average_reward(self) -> float:
        """Get average reward"""
        if not self.episode_rewards:
            return 0.0
        return np.mean(self.episode_rewards)

    def should_adapt(self) -> bool:
        """Check if curriculum should adapt"""
        if len(self.episode_successes) < self.window_size // 2:
            return False  # Not enough data yet

        success_rate = self.get_success_rate()
        return success_rate < self.min_success_rate

    def get_failure_modes(self) -> List[str]:
        """Get list of detected failure modes"""
        if not self.failure_counts:
            return []

        # Return categories with above-average failures
        avg_failures = np.mean(list(self.failure_counts.values()))
        return [
            cat for cat, count in self.failure_counts.items()
            if count > avg_failures
        ]

    def get_weakest_category(self) -> str:
        """Get the category with most failures"""
        if not self.failure_counts:
            return self.categories[0]

        return max(self.failure_counts.items(), key=lambda x: x[1])[0]

    def reset_statistics(self):
        """Reset all tracking statistics"""
        self.episode_rewards.clear()
        self.episode_successes.clear()
        self.episode_lengths.clear()
        self.failure_counts = {cat: 0 for cat in self.categories}

    def get_statistics(self) -> Dict[str, any]:
        """Get current statistics"""
        return {
            "num_episodes": len(self.episode_successes),
            "success_rate": self.get_success_rate(),
            "average_reward": self.get_average_reward(),
            "average_length": np.mean(self.episode_lengths) if self.episode_lengths else 0,
            "failure_modes": self.get_failure_modes(),
            "failure_counts": dict(self.failure_counts),
            "should_adapt": self.should_adapt(),
        }
