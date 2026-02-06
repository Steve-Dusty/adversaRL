"""
Vision-based Reward Detection
Uses computer vision to assess task success from frames
"""

import numpy as np
import cv2
from typing import Optional


class VisionRewardDetector:
    """
    Vision-based reward detector for robotic manipulation tasks
    """

    def __init__(self, task_type: str = "object_grasp"):
        """
        Initialize reward detector

        Args:
            task_type: Type of task to detect success for
        """
        self.task_type = task_type

    def calculate_reward(
        self,
        frame: np.ndarray,
        action: np.ndarray,
        task_info: Optional[dict] = None
    ) -> float:
        """
        Calculate reward from visual observation

        Args:
            frame: RGB frame (H, W, 3)
            action: Action taken
            task_info: Additional task information

        Returns:
            Reward value
        """
        if self.task_type == "object_grasp":
            return self._grasp_reward(frame, action)
        else:
            return -0.01  # Default step penalty

    def _grasp_reward(self, frame: np.ndarray, action: np.ndarray) -> float:
        """
        Reward for object grasping task

        Simple heuristic: detect if red object (cube) is in upper portion of frame
        (indicating it's been lifted)
        """
        # Convert to HSV for color detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_RGB2HSV)

        # Define red color range
        lower_red1 = np.array([0, 100, 100])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 100, 100])
        upper_red2 = np.array([180, 255, 255])

        # Create mask for red
        mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        red_mask = mask1 | mask2

        # Check if red object is in upper half (lifted)
        height = frame.shape[0]
        upper_half_mask = np.zeros_like(red_mask)
        upper_half_mask[:height//2, :] = 1

        red_in_upper = np.sum(red_mask & upper_half_mask)
        total_red = np.sum(red_mask)

        if total_red > 0:
            lift_ratio = red_in_upper / total_red

            if lift_ratio > 0.7:
                # Object is lifted - big reward
                return 10.0
            elif lift_ratio > 0.3:
                # Object is partially lifted - medium reward
                return 1.0
            else:
                # Object on table - small penalty for time
                return -0.01
        else:
            # No red object visible - penalty
            return -0.1

    def detect_success(self, frame: np.ndarray) -> bool:
        """
        Detect if task was successful

        Args:
            frame: RGB frame

        Returns:
            True if task successful
        """
        if self.task_type == "object_grasp":
            reward = self._grasp_reward(frame, np.zeros(4))
            return reward > 5.0  # Success if high reward

        return False
