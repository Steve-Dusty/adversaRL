"""
Odyssey API Client
Direct implementation of the Odyssey SDK for Python using REST API and WebSockets
"""

import asyncio
import base64
import io
import json
from dataclasses import dataclass
from typing import Optional, Callable, Any
import aiohttp
import websockets
from PIL import Image
import numpy as np


@dataclass
class VideoFrame:
    """Represents a video frame from Odyssey"""
    data: np.ndarray  # RGB numpy array
    width: int
    height: int
    timestamp: float


class OdysseyClient:
    """
    Python client for Odyssey API
    Mirrors the JavaScript SDK functionality
    """

    def __init__(self, api_key: str, base_url: str = "https://api.odyssey.ml"):
        self.api_key = api_key
        self.base_url = base_url
        self.session: Optional[aiohttp.ClientSession] = None
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.media_stream_active = False
        self.current_stream_id: Optional[str] = None
        self._frame_callbacks = []
        self._connection_callbacks = {}
        self._receiving_task: Optional[asyncio.Task] = None

    async def connect(
        self,
        on_video_frame: Optional[Callable[[VideoFrame], None]] = None,
        on_connected: Optional[Callable[[], None]] = None,
        on_stream_started: Optional[Callable[[str], None]] = None,
        on_stream_ended: Optional[Callable[[], None]] = None,
        on_stream_error: Optional[Callable[[str, str], None]] = None,
        on_error: Optional[Callable[[Exception, bool], None]] = None,
    ) -> bool:
        """
        Connect to Odyssey service

        Args:
            on_video_frame: Callback for each video frame
            on_connected: Callback when connection established
            on_stream_started: Callback when stream starts (receives stream_id)
            on_stream_ended: Callback when stream ends
            on_stream_error: Callback for stream errors (reason, message)
            on_error: Callback for general errors (error, is_fatal)

        Returns:
            True if connected successfully
        """
        try:
            # Store callbacks
            if on_video_frame:
                self._frame_callbacks.append(on_video_frame)
            self._connection_callbacks = {
                "connected": on_connected,
                "stream_started": on_stream_started,
                "stream_ended": on_stream_ended,
                "stream_error": on_stream_error,
                "error": on_error,
            }

            # Create HTTP session
            self.session = aiohttp.ClientSession(
                headers={"Authorization": f"Bearer {self.api_key}"}
            )

            # Connect to WebSocket for real-time streaming
            ws_url = f"{self.base_url.replace('https://', 'wss://')}/ /v1/stream"
            self.ws = await websockets.connect(
                ws_url,
                extra_headers={"Authorization": f"Bearer {self.api_key}"}
            )

            # Start receiving frames
            self._receiving_task = asyncio.create_task(self._receive_frames())

            self.media_stream_active = True

            if on_connected:
                on_connected()

            return True

        except Exception as e:
            if on_error:
                on_error(e, True)
            return False

    async def _receive_frames(self):
        """Background task to receive and process frames"""
        try:
            async for message in self.ws:
                if isinstance(message, bytes):
                    # Frame data
                    frame = self._decode_frame(message)
                    for callback in self._frame_callbacks:
                        callback(frame)
                else:
                    # JSON message
                    data = json.loads(message)
                    await self._handle_message(data)
        except Exception as e:
            if self._connection_callbacks.get("error"):
                self._connection_callbacks["error"](e, False)

    def _decode_frame(self, data: bytes) -> VideoFrame:
        """Decode frame data to VideoFrame object"""
        # Assuming JPEG encoded frames
        image = Image.open(io.BytesIO(data))
        array = np.array(image)
        return VideoFrame(
            data=array,
            width=image.width,
            height=image.height,
            timestamp=asyncio.get_event_loop().time()
        )

    async def _handle_message(self, data: dict):
        """Handle JSON messages from server"""
        msg_type = data.get("type")

        if msg_type == "stream_started":
            self.current_stream_id = data.get("stream_id")
            if self._connection_callbacks.get("stream_started"):
                self._connection_callbacks["stream_started"](self.current_stream_id)

        elif msg_type == "stream_ended":
            if self._connection_callbacks.get("stream_ended"):
                self._connection_callbacks["stream_ended"]()

        elif msg_type == "error":
            if self._connection_callbacks.get("stream_error"):
                self._connection_callbacks["stream_error"](
                    data.get("reason", "unknown"),
                    data.get("message", "")
                )

    async def start_stream(
        self,
        prompt: str,
        portrait: bool = False,
        image: Optional[Any] = None
    ) -> str:
        """
        Start a new interactive stream

        Args:
            prompt: Text description of the desired environment
            portrait: If True, use portrait mode (704x1280), else landscape (1280x704)
            image: Optional image file (path, PIL Image, or bytes) to start from

        Returns:
            stream_id for the started stream
        """
        payload = {
            "type": "start_stream",
            "prompt": prompt,
            "portrait": portrait,
        }

        if image:
            # Encode image if provided
            payload["image"] = await self._encode_image(image)

        await self.ws.send(json.dumps(payload))

        # Wait for stream to start (simplified)
        await asyncio.sleep(0.5)
        return self.current_stream_id or "stream_" + str(id(self))

    async def interact(self, prompt: str):
        """
        Send an interaction prompt to modify the running stream

        Args:
            prompt: Natural language instruction to modify the environment
        """
        if not self.current_stream_id:
            raise RuntimeError("No active stream to interact with")

        payload = {
            "type": "interact",
            "prompt": prompt,
            "stream_id": self.current_stream_id,
        }

        await self.ws.send(json.dumps(payload))

    async def end_stream(self):
        """End the current stream"""
        if not self.current_stream_id:
            return

        payload = {
            "type": "end_stream",
            "stream_id": self.current_stream_id,
        }

        await self.ws.send(json.dumps(payload))
        self.current_stream_id = None

    async def disconnect(self):
        """Disconnect from Odyssey"""
        if self._receiving_task:
            self._receiving_task.cancel()
            try:
                await self._receiving_task
            except asyncio.CancelledError:
                pass

        if self.ws:
            await self.ws.close()

        if self.session:
            await self.session.close()

        self.media_stream_active = False

    async def get_recording(self, stream_id: str) -> dict:
        """
        Get recording information for a completed stream

        Args:
            stream_id: The stream ID to get recording for

        Returns:
            Dictionary with video_url and duration_seconds
        """
        if not self.session:
            self.session = aiohttp.ClientSession(
                headers={"Authorization": f"Bearer {self.api_key}"}
            )

        async with self.session.get(
            f"{self.base_url}/v1/recordings/{stream_id}"
        ) as response:
            if response.status == 200:
                return await response.json()
            else:
                return {"video_url": None, "duration_seconds": 0}

    async def list_stream_recordings(self, limit: int = 10) -> dict:
        """
        List available stream recordings

        Args:
            limit: Maximum number of recordings to return

        Returns:
            Dictionary with total count and list of recordings
        """
        if not self.session:
            self.session = aiohttp.ClientSession(
                headers={"Authorization": f"Bearer {self.api_key}"}
            )

        async with self.session.get(
            f"{self.base_url}/v1/recordings",
            params={"limit": limit}
        ) as response:
            if response.status == 200:
                return await response.json()
            else:
                return {"total": 0, "recordings": []}

    async def _encode_image(self, image: Any) -> str:
        """Encode image to base64 for API"""
        if isinstance(image, str):
            # File path
            with open(image, "rb") as f:
                return base64.b64encode(f.read()).decode()
        elif isinstance(image, Image.Image):
            # PIL Image
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG")
            return base64.b64encode(buffer.getvalue()).decode()
        elif isinstance(image, bytes):
            return base64.b64encode(image).decode()
        else:
            raise TypeError(f"Unsupported image type: {type(image)}")


# For backward compatibility
Odyssey = OdysseyClient
