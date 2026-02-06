#!/usr/bin/env python3
"""
Main training script with adaptive curriculum
"""

import os
import argparse
import yaml
from pathlib import Path
from dotenv import load_dotenv

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.callbacks import BaseCallback

from adversarl.envs.odyssey_env import OdysseyEnv
from adversarl.curriculum.controller import CurriculumController
from adversarl.curriculum.failure_detector import FailureDetector

load_dotenv()


class CurriculumCallback(BaseCallback):
    """
    Callback to adapt curriculum during training
    """

    def __init__(
        self,
        failure_detector: FailureDetector,
        curriculum_controller: CurriculumController,
        env: OdysseyEnv,
        adaptation_frequency: int = 50,
        verbose: int = 0
    ):
        super().__init__(verbose)
        self.failure_detector = failure_detector
        self.curriculum_controller = curriculum_controller
        self.env = env
        self.adaptation_frequency = adaptation_frequency
        self.episode_rewards = []
        self.episode_lengths = []
        self.current_episode_reward = 0
        self.current_episode_length = 0

    def _on_step(self) -> bool:
        """Called at each step"""
        # Track episode progress
        self.current_episode_reward += self.locals["rewards"][0]
        self.current_episode_length += 1

        # Check if episode ended
        if self.locals["dones"][0]:
            # Detect success (simplified)
            success = self.current_episode_reward > 0

            # Record episode
            self.failure_detector.record_episode(
                reward=self.current_episode_reward,
                success=success,
                length=self.current_episode_length,
                conditions=getattr(self.env, "current_conditions", "neutral")
            )

            # Log stats
            stats = self.failure_detector.get_statistics()
            self.logger.record("curriculum/success_rate", stats["success_rate"])
            self.logger.record("curriculum/avg_reward", stats["average_reward"])
            self.logger.record("curriculum/should_adapt", float(stats["should_adapt"]))

            # Check if we should adapt curriculum
            if (len(self.failure_detector.episode_successes) % self.adaptation_frequency == 0 and
                self.failure_detector.should_adapt()):
                self._adapt_curriculum()

            # Reset episode tracking
            self.current_episode_reward = 0
            self.current_episode_length = 0

        return True

    def _adapt_curriculum(self):
        """Adapt the curriculum based on failures"""
        stats = self.failure_detector.get_statistics()
        failure_modes = stats["failure_modes"]
        success_rate = stats["success_rate"]

        print(f"\n🎯 ADAPTING CURRICULUM")
        print(f"   Success rate: {success_rate:.1%}")
        print(f"   Failure modes: {failure_modes}")

        # Generate perturbation
        try:
            perturbation = self.curriculum_controller.generate_perturbation(
                failure_modes=failure_modes,
                current_conditions=getattr(self.env, "current_conditions", "neutral"),
                success_rate=success_rate
            )
            print(f"   Perturbation: {perturbation}")

            # Apply perturbation to environment
            # This would be done through the Odyssey interact() call
            # For now, just store it
            self.env.current_conditions = perturbation

        except Exception as e:
            print(f"   ⚠️  Failed to generate perturbation: {e}")


def create_env(config: dict):
    """Create Odyssey environment"""
    return OdysseyEnv(
        api_key=os.getenv("ODYSSEY_API_KEY"),
        initial_prompt=config["odyssey"]["initial_prompt"],
        task_type=config["environment"]["task"],
        image_size=(
            config["environment"]["image_height"],
            config["environment"]["image_width"]
        ),
        portrait=config["odyssey"]["portrait"],
        frame_skip=config["environment"]["frame_skip"],
        episode_length=config["environment"]["episode_length"],
        action_space_type="discrete",
        num_discrete_actions=5,
    )


def train(args):
    """Main training function"""
    # Load config
    config_path = Path(args.config)
    with open(config_path) as f:
        config = yaml.safe_load(f)

    print("="*60)
    print("🚀 AdversaRL Training")
    print("="*60)
    print(f"Config: {config_path}")
    print(f"Curriculum: {'ENABLED' if config['curriculum']['enabled'] else 'DISABLED'}")
    print("="*60)

    # Create environment
    print("\n📦 Creating environment...")
    env = create_env(config)
    env = DummyVecEnv([lambda: env])
    print("✅ Environment created")

    # Create curriculum components
    failure_detector = None
    curriculum_controller = None
    callback = None

    if config["curriculum"]["enabled"]:
        print("\n🎯 Initializing curriculum system...")
        failure_detector = FailureDetector(
            window_size=config["curriculum"]["failure_window"],
            min_success_rate=config["curriculum"]["min_success_rate"],
        )

        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key:
            curriculum_controller = CurriculumController(
                anthropic_api_key=anthropic_key,
                model=config["curriculum"]["llm_model"],
            )
            print("✅ Curriculum controller initialized")
        else:
            print("⚠️  ANTHROPIC_API_KEY not found, curriculum disabled")
            config["curriculum"]["enabled"] = False

    # Create PPO agent
    print("\n🤖 Creating RL agent...")
    model = PPO(
        "CnnPolicy",
        env,
        learning_rate=config["training"]["learning_rate"],
        n_steps=config["training"]["n_steps"],
        batch_size=config["training"]["batch_size"],
        n_epochs=config["training"]["n_epochs"],
        gamma=config["training"]["gamma"],
        gae_lambda=config["training"]["gae_lambda"],
        clip_range=config["training"]["clip_range"],
        ent_coef=config["training"]["ent_coef"],
        vf_coef=config["training"]["vf_coef"],
        max_grad_norm=config["training"]["max_grad_norm"],
        verbose=1,
        tensorboard_log="./logs/tensorboard",
    )
    print("✅ Agent created")

    # Setup callback
    if config["curriculum"]["enabled"] and curriculum_controller:
        callback = CurriculumCallback(
            failure_detector=failure_detector,
            curriculum_controller=curriculum_controller,
            env=env.envs[0],
            adaptation_frequency=config["curriculum"]["adaptation_frequency"],
            verbose=1,
        )

    # Train
    print("\n🏋️ Starting training...")
    print(f"   Total timesteps: {config['training']['total_timesteps']:,}")
    print()

    model.learn(
        total_timesteps=config["training"]["total_timesteps"],
        callback=callback,
        log_interval=config["logging"]["log_interval"],
    )

    # Save model
    save_path = Path("./checkpoints")
    save_path.mkdir(exist_ok=True)
    model_file = save_path / "ppo_odyssey_final.zip"
    model.save(model_file)
    print(f"\n💾 Model saved to: {model_file}")

    # Print final statistics
    if failure_detector:
        stats = failure_detector.get_statistics()
        print("\n📊 Final Statistics:")
        print(f"   Episodes: {stats['num_episodes']}")
        print(f"   Success Rate: {stats['success_rate']:.1%}")
        print(f"   Avg Reward: {stats['average_reward']:.2f}")
        print(f"   Failure Modes: {stats['failure_modes']}")

    print("\n" + "="*60)
    print("✅ TRAINING COMPLETE!")
    print("="*60)


def main():
    parser = argparse.ArgumentParser(description="Train RL agent with adaptive curriculum")
    parser.add_argument(
        "--config",
        type=str,
        default="config/default.yaml",
        help="Path to config file"
    )
    parser.add_argument(
        "--no-curriculum",
        action="store_true",
        help="Disable curriculum learning"
    )

    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
