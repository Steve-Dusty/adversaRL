"""Load and validate training specifications generated from user goals."""

import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


class SpecificationError(Exception):
    """Raised when specification is invalid or missing."""
    pass


@dataclass
class TrainingSpec:
    """Structured training specification."""
    task_type: str
    success_criteria: str
    environment_prompt: str
    perturbations: List[str]
    action_space: str
    observation: str
    episode_length: int
    reward_structure: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'task_type': self.task_type,
            'success_criteria': self.success_criteria,
            'environment_prompt': self.environment_prompt,
            'perturbations': self.perturbations,
            'action_space': self.action_space,
            'observation': self.observation,
            'episode_length': self.episode_length,
            'reward_structure': self.reward_structure,
        }


def load_training_spec(config_path: Optional[str] = None) -> TrainingSpec:
    """
    Load training specification from config file.

    Args:
        config_path: Path to specification JSON file.
                     If None, uses default path: config/training_spec.json

    Returns:
        TrainingSpec object with parsed specification

    Raises:
        SpecificationError: If specification is missing or invalid
    """
    if config_path is None:
        # Default path relative to project root
        project_root = Path(__file__).parent.parent.parent
        config_path = project_root / 'config' / 'training_spec.json'
    else:
        config_path = Path(config_path)

    if not config_path.exists():
        raise SpecificationError(
            f"Training specification not found at {config_path}. "
            "Please generate a specification using the goal input interface."
        )

    try:
        with open(config_path, 'r') as f:
            spec_data = json.load(f)
    except json.JSONDecodeError as e:
        raise SpecificationError(f"Invalid JSON in specification file: {e}")

    # Validate required fields
    required_fields = [
        'task_type', 'success_criteria', 'environment_prompt',
        'perturbations', 'action_space', 'observation', 'episode_length'
    ]

    missing_fields = [field for field in required_fields if field not in spec_data]
    if missing_fields:
        raise SpecificationError(
            f"Specification missing required fields: {', '.join(missing_fields)}"
        )

    # Create TrainingSpec object
    spec = TrainingSpec(
        task_type=spec_data['task_type'],
        success_criteria=spec_data['success_criteria'],
        environment_prompt=spec_data['environment_prompt'],
        perturbations=spec_data['perturbations'],
        action_space=spec_data['action_space'],
        observation=spec_data['observation'],
        episode_length=spec_data['episode_length'],
        reward_structure=spec_data.get('reward_structure', {
            'success': 1.0,
            'step_penalty': -0.01,
            'distance_shaping': True
        })
    )

    return spec


def get_default_spec() -> TrainingSpec:
    """
    Get default specification for fallback/testing.

    Returns:
        Default TrainingSpec for tabletop manipulation
    """
    return TrainingSpec(
        task_type="tabletop_pick_and_place",
        success_criteria="Object placed in target zone within 5cm tolerance",
        environment_prompt="Robot arm on white table with red cube, clean workshop lighting, industrial setting",
        perturbations=["lighting", "occlusion", "texture", "clutter"],
        action_space="6dof_end_effector",
        observation="rgb_camera_720p",
        episode_length=50,
        reward_structure={
            'success': 1.0,
            'step_penalty': -0.01,
            'distance_shaping': True
        }
    )


def save_training_spec(spec: TrainingSpec, output_path: Optional[str] = None) -> str:
    """
    Save training specification to file.

    Args:
        spec: TrainingSpec to save
        output_path: Where to save. If None, uses default path.

    Returns:
        Path where spec was saved
    """
    if output_path is None:
        project_root = Path(__file__).parent.parent.parent
        output_path = project_root / 'config' / 'training_spec.json'
    else:
        output_path = Path(output_path)

    # Ensure directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(spec.to_dict(), f, indent=2)

    return str(output_path)
