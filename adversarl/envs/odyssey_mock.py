"""
Mock Odyssey Client for Testing
Generates synthetic frames for development and testing without API access
"""

import asyncio
import numpy as np
from dataclasses import dataclass
from typing import Optional, Callable
from PIL import Image, ImageDraw, ImageFont


@dataclass
class VideoFrame:
    """Represents a video frame"""
    data: np.ndarray
    width: int
    height: int
    timestamp: float


class MockOdysseyClient:
    """
    Mock Odyssey client that generates synthetic frames
    Useful for development and testing without API access
    """

    def __init__(self, api_key: str = "mock_key"):
        self.api_key = api_key
        self.connected = False
        self.current_stream_id: Optional[str] = None
        self._frame_callbacks = []
        self._connection_callbacks = {}
        self._streaming_task: Optional[asyncio.Task] = None
        self._should_stream = False

        # Simulation state
        self.arm_x = 320
        self.arm_y = 400
        self.object_x = 400
        self.object_y = 450
        self.gripper_open = True
        self.lighting = "neutral"
        self.frame_count = 0

    async def connect(
        self,
        on_video_frame: Optional[Callable[[VideoFrame], None]] = None,
        on_connected: Optional[Callable[[], None]] = None,
        on_stream_started: Optional[Callable[[str], None]] = None,
        on_stream_ended: Optional[Callable[[], None]] = None,
        on_stream_error: Optional[Callable[[str, str], None]] = None,
        on_error: Optional[Callable[[Exception, bool], None]] = None,
    ) -> bool:
        """Connect to mock Odyssey"""
        self.connected = True

        if on_video_frame:
            self._frame_callbacks.append(on_video_frame)

        self._connection_callbacks = {
            "connected": on_connected,
            "stream_started": on_stream_started,
            "stream_ended": on_stream_ended,
            "stream_error": on_stream_error,
            "error": on_error,
        }

        if on_connected:
            on_connected()

        return True

    async def start_stream(
        self,
        prompt: str,
        portrait: bool = False,
        image: Optional[any] = None
    ) -> str:
        """Start mock stream"""
        import uuid
        self.current_stream_id = f"mock_stream_{uuid.uuid4().hex[:8]}"
        self._should_stream = True

        # Parse prompt for environment setup
        self._parse_prompt(prompt)

        # Start frame generation
        self._streaming_task = asyncio.create_task(self._generate_frames(portrait))

        if self._connection_callbacks.get("stream_started"):
            self._connection_callbacks["stream_started"](self.current_stream_id)

        return self.current_stream_id

    def _parse_prompt(self, prompt: str):
        """Parse prompt to set up environment"""
        prompt_lower = prompt.lower()

        # Parse lighting
        if "dim" in prompt_lower or "dark" in prompt_lower:
            self.lighting = "dim"
        elif "harsh" in prompt_lower or "bright" in prompt_lower:
            self.lighting = "harsh"
        elif "dramatic" in prompt_lower:
            self.lighting = "dramatic"
        else:
            self.lighting = "neutral"

        # Reset positions for new stream
        self.arm_x = 320
        self.arm_y = 400
        self.object_x = 400
        self.object_y = 450
        self.gripper_open = True

    async def _generate_frames(self, portrait: bool = False):
        """Generate synthetic frames at ~20 FPS"""
        width = 704 if portrait else 1280
        height = 1280 if portrait else 704

        while self._should_stream:
            # Generate frame
            frame_data = self._render_frame(width, height)

            frame = VideoFrame(
                data=frame_data,
                width=width,
                height=height,
                timestamp=asyncio.get_event_loop().time()
            )

            # Send to callbacks
            for callback in self._frame_callbacks:
                try:
                    callback(frame)
                except Exception as e:
                    print(f"Frame callback error: {e}")

            self.frame_count += 1

            # ~20 FPS
            await asyncio.sleep(0.05)

    def _render_frame(self, width: int, height: int) -> np.ndarray:
        """Render a synthetic frame"""
        # Create base image
        if self.lighting == "dim":
            bg_color = (40, 40, 45)
        elif self.lighting == "harsh":
            bg_color = (220, 220, 225)
        elif self.lighting == "dramatic":
            bg_color = (60, 50, 80)
        else:  # neutral
            bg_color = (200, 200, 200)

        img = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(img)

        # Draw table (lower half)
        table_color = (180, 160, 140)
        draw.rectangle([(0, height//2), (width, height)], fill=table_color)

        # Draw object (cube)
        cube_size = 40
        cube_x = int(self.object_x * (width / 640))
        cube_y = int(self.object_y * (height / 480))

        # Apply lighting to cube color
        if self.lighting == "dim":
            cube_color = (120, 40, 40)
        elif self.lighting == "harsh":
            cube_color = (255, 100, 100)
        else:
            cube_color = (200, 50, 50)

        draw.rectangle([
            (cube_x - cube_size//2, cube_y - cube_size//2),
            (cube_x + cube_size//2, cube_y + cube_size//2)
        ], fill=cube_color, outline=(100, 30, 30), width=2)

        # Draw robotic arm (simple representation)
        arm_x = int(self.arm_x * (width / 640))
        arm_y = int(self.arm_y * (height / 480))

        # Arm base
        draw.rectangle([
            (arm_x - 15, arm_y + 50),
            (arm_x + 15, arm_y + 80)
        ], fill=(100, 100, 120))

        # Arm segment
        draw.rectangle([
            (arm_x - 10, arm_y),
            (arm_x + 10, arm_y + 50)
        ], fill=(120, 120, 140))

        # Gripper
        gripper_width = 15 if self.gripper_open else 5
        draw.rectangle([
            (arm_x - gripper_width, arm_y - 20),
            (arm_x - 5, arm_y)
        ], fill=(80, 80, 100))
        draw.rectangle([
            (arm_x + 5, arm_y - 20),
            (arm_x + gripper_width, arm_y)
        ], fill=(80, 80, 100))

        # Add text overlay with info
        try:
            draw.text(
                (10, 10),
                f"Mock Odyssey | Lighting: {self.lighting} | Frame: {self.frame_count}",
                fill=(0, 255, 0)
            )
        except:
            pass

        return np.array(img)

    async def interact(self, prompt: str):
        """Process interaction prompt"""
        prompt_lower = prompt.lower()

        # Parse movement commands
        if "forward" in prompt_lower or "towards" in prompt_lower:
            # Move arm towards object
            diff_x = self.object_x - self.arm_x
            diff_y = self.object_y - self.arm_y
            self.arm_x += diff_x * 0.1
            self.arm_y += diff_y * 0.1

        elif "backward" in prompt_lower or "away" in prompt_lower:
            diff_x = self.object_x - self.arm_x
            diff_y = self.object_y - self.arm_y
            self.arm_x -= diff_x * 0.1
            self.arm_y -= diff_y * 0.1

        elif "left" in prompt_lower:
            self.arm_x -= 20

        elif "right" in prompt_lower:
            self.arm_x += 20

        elif "up" in prompt_lower:
            self.arm_y -= 20

        elif "down" in prompt_lower:
            self.arm_y += 20

        # Parse gripper commands
        if "close" in prompt_lower or "grasp" in prompt_lower:
            self.gripper_open = False
            # If close to object, "pick it up"
            dist = np.sqrt((self.arm_x - self.object_x)**2 + (self.arm_y - self.object_y)**2)
            if dist < 50:
                # Move object with arm
                self.object_x = self.arm_x
                self.object_y = self.arm_y

        elif "open" in prompt_lower or "release" in prompt_lower:
            self.gripper_open = True

        # Parse lighting commands
        if "dim" in prompt_lower or "dark" in prompt_lower:
            self.lighting = "dim"
        elif "bright" in prompt_lower or "harsh" in prompt_lower:
            self.lighting = "harsh"
        elif "dramatic" in prompt_lower:
            self.lighting = "dramatic"

    async def end_stream(self):
        """End current stream"""
        self._should_stream = False

        if self._streaming_task:
            self._streaming_task.cancel()
            try:
                await self._streaming_task
            except asyncio.CancelledError:
                pass

        if self._connection_callbacks.get("stream_ended"):
            self._connection_callbacks["stream_ended"]()

        self.current_stream_id = None

    async def disconnect(self):
        """Disconnect"""
        await self.end_stream()
        self.connected = False

    async def get_recording(self, stream_id: str) -> dict:
        """Get mock recording"""
        return {
            "video_url": f"https://mock.odyssey.ml/recordings/{stream_id}.mp4",
            "duration_seconds": self.frame_count * 0.05
        }

    async def list_stream_recordings(self, limit: int = 10) -> dict:
        """List mock recordings"""
        return {
            "total": 1,
            "recordings": [
                {
                    "stream_id": self.current_stream_id or "mock_stream_123",
                    "duration_seconds": self.frame_count * 0.05
                }
            ]
        }


# Alias for compatibility
Odyssey = MockOdysseyClient
