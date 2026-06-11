from __future__ import annotations

import asyncio
import math
import random
from datetime import datetime

from app.data.seed import CHECKPOINTS, set_live_checkpoint_status, status_for


def bootstrap_live_state() -> None:
    for checkpoint in CHECKPOINTS:
        row = status_for(checkpoint, datetime.now())
        set_live_checkpoint_status(checkpoint["id"], row["current_queue"], row["wait_minutes"])


async def simulate_realtime(interval_seconds: int = 20) -> None:
    """Moves queue numbers every 20 seconds for demo-grade realtime."""
    bootstrap_live_state()
    while True:
        hour = datetime.now().hour + datetime.now().minute / 60
        for checkpoint in CHECKPOINTS:
            capacity = checkpoint["capacity_per_hour"]
            base = 0.28 + 0.55 * abs(math.sin((hour - 6) * math.pi / 12))
            land_bonus = 0.35 if checkpoint["type"] == "land" else 0.08
            load_factor = min(1.65, max(0.05, base + land_bonus + random.uniform(-0.14, 0.14)))
            queue = int(capacity * load_factor * random.uniform(0.86, 1.16))
            wait = int(queue * (2.1 if checkpoint["type"] == "land" else 1.25) + random.randint(-5, 8))
            set_live_checkpoint_status(checkpoint["id"], max(0, queue), max(0, wait))
        await asyncio.sleep(interval_seconds)

