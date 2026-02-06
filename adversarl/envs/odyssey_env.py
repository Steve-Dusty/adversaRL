"""
Gymnasium Environment Wrapper for Odyssey
Enables RL agents to train on Odyssey-generated environments
"""

import asyncio
import numpy as np
from typing import Optional, Tuple, Dict, Any
import gymnasium as gym
from gymnasium import spaces
import threading
import queue

from odyssey import Odyssey, VideoFrame


class OdysseyEnv(gym.Env):
    """
    Gymnasium environment wrapper for Odyssey interactive streams

    This environment allows RL agents to interact with Odyssey-generated
    visual environments in real-time.

    Observation Space: RGB images (height, width, 3)
    Action Space: Discrete or continuous actions (task-dependent)
    """

    metadata = {"render_modes": ["rgb_array", "human"]}

    def __init__(
        self,
        api_key: str,
        initial_prompt: str,
        task_type: str = "navigation",
        image_size: Tuple[int, int] = (480, 640),  # height, width
        portrait: bool = False,
        frame_skip: int = 4,
        episode_length: int = 200,
        action_space_type: str = "discrete",
        num_discrete_actions: int = 5,
        render_mode: Optional[str] = None,
    ):
        """
        Initialize Odyssey Gymnasium environment

        Args:
            api_key: Odyssey API key
            initial_prompt: Base prompt for environment generation
            task_type: Type of task (navigation, manipulation, etc.)
            image_size: (height, width) for observations
            portrait: Use portrait mode (704x1280) vs landscape (1280x704)
            frame_skip: Number of frames to skip between actions
            episode_length: Maximum episode length in steps
            action_space_type: "discrete" or "continuous"
            num_discrete_actions: Number of actions if discrete
            render_mode: Rendering mode
        """
        super().__init__()

        self.api_key = api_key
        self.initial_prompt = initial_prompt
        self.task_type = task_type
        self.image_size = image_size
        self.portrait = portrait
        self.frame_skip = frame_skip
        self.episode_length = episode_length
        self.render_mode = render_mode

        # Define observation space (RGB images)
        self.observation_space = spaces.Box(
            low=0,
            high=255,
            shape=(image_size[0], image_size[1], 3),
            dtype=np.uint8
        )

        # Define action space
        if action_space_type == "discrete":
            # Discrete actions: [forward, backward, left, right, interact]
            self.action_space = spaces.Discrete(num_discrete_actions)
            self.action_type = "discrete"
        else:
            # Continuous actions: [dx, dy, dz, gripper]
            self.action_space = spaces.Box(
                low=-1.0,
                high=1.0,
                shape=(4,),
                dtype=np.float32
            )
            self.action_type = "continuous"

        # Initialize Odyssey client
        self.client: Optional[Odyssey] = None
        self.stream_id: Optional[str] = None

        # Frame buffer for async frame reception
        self.frame_queue = queue.Queue(maxsize=10)
        self.latest_frame: Optional[VideoFrame] = None

        # Episode state
        self.current_step = 0
        self.episode_reward = 0.0

        # Run async event loop in separate thread
        self.loop = None
        self.loop_thread = None
        self._connected = threading.Event()

    def _start_event_loop(self):
        """Start asyncio event loop in separate thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def _run_coroutine(self, coro):
        """Run a coroutine in the background event loop"""
        if self.loop is None:
            # Start event loop thread
            self.loop_thread = threading.Thread(target=self._start_event_loop, daemon=True)
            self.loop_thread.start()
            import time
            time.sleep(0.5)  # Give loop time to start

        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return future.result(timeout=30)

    def _on_frame(self, frame: VideoFrame):
        """Callback for received frames"""
        self.latest_frame = frame
        try:
            self.frame_queue.put_nowait(frame)
        except queue.Full:
            # Drop old frames if queue is full
            try:
                self.frame_queue.get_nowait()
                self.frame_queue.put_nowait(frame)
            except:
                pass

    def _connect(self):
        """Connect to Odyssey"""
        async def _async_connect():
            self.client = Odyssey(api_key=self.api_key)
            await self.client.connect(
                on_video_frame=self._on_frame,
                on_stream_started=lambda stream_id: self._connected.set(),
            )

        self._run_coroutine(_async_connect())
        # Wait for connection
        self._connected.wait(timeout=10)

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Reset the environment

        Returns:
            observation: Initial RGB frame
            info: Additional information
        """
        super().reset(seed=seed)

        # Connect if not connected
        if self.client is None:
            self._connect()

        # End previous stream if exists
        if self.stream_id:
            async def _end_stream():
                await self.client.end_stream()

            try:
                self._run_coroutine(_end_stream())
            except:
                pass

        # Start new stream
        prompt = self.initial_prompt
        if options and "prompt" in options:
            prompt = options["prompt"]

        async def _start_stream():
            return await self.client.start_stream(
                prompt=prompt,
                portrait=self.portrait
            )

        self.stream_id = self._run_coroutine(_start_stream())

        # Wait for first frame
        import time
        timeout = time.time() + 5
        while self.latest_frame is None and time.time() < timeout:
            time.sleep(0.1)

        # Reset episode state
        self.current_step = 0
        self.episode_reward = 0.0

        # Get observation
        obs = self._get_observation()
        info = {"step": self.current_step, "stream_id": self.stream_id}

        return obs, info

    def step(
        self,
        action: np.ndarray
    ) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """
        Execute one step in the environment

        Args:
            action: Action to take

        Returns:
            observation: RGB frame after action
            reward: Reward for this step
            terminated: Whether episode is done
            truncated: Whether episode was truncated
            info: Additional information
        """
        # Convert action to Odyssey prompt
        prompt = self._action_to_prompt(action)

        # Send interaction
        if prompt:
            async def _interact():
                await self.client.interact(prompt)

            try:
                self._run_coroutine(_interact())
            except Exception as e:
                print(f"Interaction error: {e}")

        # Wait for frames (frame skip)
        import time
        time.sleep(self.frame_skip * 0.05)  # ~20 FPS = 50ms per frame

        # Get observation
        obs = self._get_observation()

        # Calculate reward (simplified for now)
        reward = self._calculate_reward(obs, action)

        # Check if done
        self.current_step += 1
        terminated = self.current_step >= self.episode_length
        truncated = False

        self.episode_reward += reward

        info = {
            "step": self.current_step,
            "episode_reward": self.episode_reward,
            "stream_id": self.stream_id,
        }

        return obs, reward, terminated, truncated, info

    def _get_observation(self) -> np.ndarray:
        """Get current observation (RGB frame)"""
        if self.latest_frame is None:
            # Return black image if no frame available
            return np.zeros(
                (self.image_size[0], self.image_size[1], 3),
                dtype=np.uint8
            )

        # Resize frame to match observation space
        from PIL import Image
        img = Image.fromarray(self.latest_frame.data)
        img = img.resize((self.image_size[1], self.image_size[0]))
        return np.array(img, dtype=np.uint8)

    def _action_to_prompt(self, action: np.ndarray) -> str:
        """
        Convert RL action to Odyssey interaction prompt

        This is task-specific and should be customized for different tasks
        """
        if self.action_type == "discrete":
            action_idx = int(action)
            if self.task_type == "navigation":
                action_map = {
                    0: "move forward",
                    1: "move backward",
                    2: "turn left",
                    3: "turn right",
                    4: "stop and observe",
                }
                return action_map.get(action_idx, "")

            elif self.task_type == "manipulation":
                action_map = {
                    0: "move arm towards object",
                    1: "move arm away from object",
                    2: "move arm left",
                    3: "move arm right",
                    4: "close gripper",
                }
                return action_map.get(action_idx, "")

        else:  # continuous
            # Convert continuous actions to prompts
            if self.task_type == "manipulation":
                dx, dy, dz, gripper = action
                parts = []
                if abs(dx) > 0.3:
                    parts.append(f"move arm {'right' if dx > 0 else 'left'}")
                if abs(dy) > 0.3:
                    parts.append(f"move arm {'forward' if dy > 0 else 'backward'}")
                if abs(dz) > 0.3:
                    parts.append(f"move arm {'up' if dz > 0 else 'down'}")
                if gripper > 0.5:
                    parts.append("close gripper")
                elif gripper < -0.5:
                    parts.append("open gripper")
                return " and ".join(parts) if parts else ""

        return ""

    def _calculate_reward(self, obs: np.ndarray, action: np.ndarray) -> float:
        """
        Calculate reward from observation

        This is task-specific and should be customized.
        For now, returns a simple placeholder reward.
        """
        # TODO: Implement vision-based reward detection
        # This should use a classifier/detector to assess task success
        # For example: "is the object grasped?", "did agent reach goal?"

        # Placeholder: small negative reward for each step (encourage efficiency)
        return -0.01

    def render(self):
        """Render the environment"""
        if self.render_mode == "rgb_array":
            return self._get_observation()
        elif self.render_mode == "human":
            # Display frame using matplotlib or cv2
            import cv2
            frame = self._get_observation()
            cv2.imshow("Odyssey Environment", cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
            cv2.waitKey(1)
            return frame

    def close(self):
        """Clean up resources"""
        if self.client:
            async def _cleanup():
                if self.stream_id:
                    await self.client.end_stream()
                await self.client.disconnect()

            try:
                self._run_coroutine(_cleanup())
            except:
                pass

        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)

        super().close()


# Register environment with Gymnasium
gym.register(
    id="OdysseyManipulation-v0",
    entry_point="adversarl.envs.odyssey_env:OdysseyEnv",
    kwargs={
        "task_type": "manipulation",
        "initial_prompt": "A robotic arm on a white table with a small red cube in front of it, neutral lighting",
    }
)

gym.register(
    id="OdysseyNavigation-v0",
    entry_point="adversarl.envs.odyssey_env:OdysseyEnv",
    kwargs={
        "task_type": "navigation",
        "initial_prompt": "First person view walking through an office environment",
    }
)
