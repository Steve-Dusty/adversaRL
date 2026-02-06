"""
AdversaRL: Adversarial Sim-to-Real Transfer via World Model Curriculum Training
"""

__version__ = "0.1.0"

from adversarl.envs.odyssey_env import OdysseyEnv
from adversarl.curriculum.controller import CurriculumController
from adversarl.curriculum.failure_detector import FailureDetector

__all__ = [
    "OdysseyEnv",
    "CurriculumController",
    "FailureDetector",
]
