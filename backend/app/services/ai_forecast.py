from __future__ import annotations

import json
import math
import os
import random
from datetime import datetime

import httpx

from app.data.seed import forecast_rows


SYSTEM = (
    "Ты аналитик логистики Мангистауской области Казахстана. "
    "Анализируй загруженность КПП и возвращай только валидный JSON."
)


def heuristic_forecast(checkpoint_name: str, checkpoint_id: int, current_queue: int) -> dict:
    forecast = forecast_rows(checkpoint_id, 6)
    best = min(forecast, key=lambda row: row["wait_minutes"])
    if best["wait_minutes"] < 60:
        recommendation = f"Лучшее окно для пересечения через {checkpoint_name}: {best['clock']}, ожидание около {best['wait_minutes']} мин."
    elif current_queue > 60:
        recommendation = f"Очередь высокая. Водителю лучше отложить выезд до {best['clock']} или проверить КПП Тажен."
    else:
        recommendation = f"Можно двигаться к {checkpoint_name}; существенного ухудшения в ближайшие 6 часов не ожидается."
    return {
        "provider": "heuristic",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "forecast_6h": forecast,
        "best_crossing_time": best["clock"],
        "recommendation": recommendation,
    }


def mock_forecast(current_queue: int, hour: int, checkpoint_name: str) -> dict:
    def future_load(h_offset: int) -> int:
        h = (hour + h_offset) % 24
        base = 20
        morning = 40 * math.exp(-((h - 8.5) ** 2) / 4)
        evening = 35 * math.exp(-((h - 16) ** 2) / 5)
        return max(5, int(base + morning + evening + random.randint(-3, 3)))

    f1, f3, f6 = future_load(1), future_load(3), future_load(6)
    best_h = min(range(24), key=lambda h: future_load(h - hour))
    wait_factor = 2.0 if "КПП" in checkpoint_name or "РљРџРџ" in checkpoint_name else 1.4
    drop = max(0, current_queue - f6)
    return {
        "forecast": [
            {"period": "+1ч", "trucks": f1, "wait_min": int(f1 * wait_factor)},
            {"period": "+3ч", "trucks": f3, "wait_min": int(f3 * wait_factor)},
            {"period": "+6ч", "trucks": f6, "wait_min": int(f6 * wait_factor)},
        ],
        "best_time": f"{best_h:02d}:00",
        "recommendation": (
            f"Оптимальное время въезда через {checkpoint_name}: {best_h:02d}:00. "
            f"Ожидаемое снижение очереди на {drop} авто."
        ),
        "confidence": 0.74,
        "provider": "mock",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


async def ai_card_forecast(checkpoint_name: str, checkpoint_id: int, history: list[dict], current_queue: int, wait_minutes: int) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return mock_forecast(current_queue, datetime.now().hour, checkpoint_name)

    hourly = [
        {
            "hour": row["hour"],
            "avg_queue": row["queue_size"],
            "avg_wait": row["wait_minutes"],
        }
        for row in history[-24:]
    ]
    user_msg = f"""
КПП: {checkpoint_name}
Сейчас: {current_queue} грузовиков в очереди, ожидание {wait_minutes} минут
Среднее по часам: {json.dumps(hourly, ensure_ascii=False)}

Верни JSON строго в этом формате:
{{
  "forecast": [
    {{"period": "+1ч", "trucks": 42, "wait_min": 65}},
    {{"period": "+3ч", "trucks": 28, "wait_min": 40}},
    {{"period": "+6ч", "trucks": 18, "wait_min": 25}}
  ],
  "best_time": "14:30",
  "recommendation": "Рекомендуем подъезжать после 14:30 — загруженность снизится на 40%.",
  "confidence": 0.78
}}
"""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest"),
                    "max_tokens": 512,
                    "system": SYSTEM,
                    "messages": [{"role": "user", "content": user_msg}],
                },
            )
        response.raise_for_status()
        parsed = json.loads(response.json()["content"][0]["text"])
        parsed["provider"] = "anthropic"
        parsed["generated_at"] = datetime.now().isoformat(timespec="seconds")
        return parsed
    except Exception:
        return mock_forecast(current_queue, datetime.now().hour, checkpoint_name)


async def forecast_checkpoint(checkpoint_name: str, checkpoint_id: int, history: list[dict], current_queue: int) -> dict:
    """Use OpenAI/Anthropic when configured; otherwise deterministic forecast for demo reliability."""
    provider = os.getenv("AI_PROVIDER", "heuristic").lower()
    if provider not in {"openai", "anthropic"}:
        return heuristic_forecast(checkpoint_name, checkpoint_id, current_queue)

    prompt = f"""
КПП: {checkpoint_name}
Текущее время: {datetime.now().strftime('%H:%M')}
Текущая очередь: {current_queue} грузовиков
Данные по часам: {json.dumps(history, ensure_ascii=False)}

Верни JSON:
{{
  "forecast_6h": [
    {{"hour":"+1h","predicted_trucks":0,"wait_minutes":0}},
    {{"hour":"+2h","predicted_trucks":0,"wait_minutes":0}},
    {{"hour":"+3h","predicted_trucks":0,"wait_minutes":0}},
    {{"hour":"+4h","predicted_trucks":0,"wait_minutes":0}},
    {{"hour":"+5h","predicted_trucks":0,"wait_minutes":0}},
    {{"hour":"+6h","predicted_trucks":0,"wait_minutes":0}}
  ],
  "best_crossing_time": "чч:мм",
  "recommendation": "краткая рекомендация водителю на русском"
}}
"""
    try:
        if provider == "openai" and os.getenv("OPENAI_API_KEY"):
            return await _openai_forecast(prompt)
        if provider == "anthropic" and os.getenv("ANTHROPIC_API_KEY"):
            return await _anthropic_forecast(prompt)
    except Exception:
        return heuristic_forecast(checkpoint_name, checkpoint_id, current_queue)
    return heuristic_forecast(checkpoint_name, checkpoint_id, current_queue)


async def _openai_forecast(prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
            json={
                "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                "instructions": SYSTEM,
                "input": prompt,
                "text": {"format": {"type": "json_object"}},
                "max_output_tokens": 500,
            },
        )
    response.raise_for_status()
    data = response.json()
    text = data.get("output_text")
    if not text:
        text = data["output"][0]["content"][0]["text"]
    parsed = json.loads(text)
    parsed["provider"] = "openai"
    parsed["generated_at"] = datetime.now().isoformat(timespec="seconds")
    return parsed


async def _anthropic_forecast(prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest"),
                "max_tokens": 500,
                "system": SYSTEM,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    response.raise_for_status()
    text = response.json()["content"][0]["text"]
    parsed = json.loads(text)
    parsed["provider"] = "anthropic"
    parsed["generated_at"] = datetime.now().isoformat(timespec="seconds")
    return parsed
