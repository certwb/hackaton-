from __future__ import annotations

import asyncio
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from app.data.seed import (
    CARRIERS,
    CHECKPOINTS,
    ROUTES,
    checkpoint_history,
    current_checkpoints,
    get_checkpoint_static,
    port_metrics,
    shipments,
    status_for,
)
from app.services.ai_forecast import ai_card_forecast, forecast_checkpoint
from app.services.simulator import simulate_realtime


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env")

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI(
    title="Mangystau Logistics MVP",
    description="Akimat dashboard + KPP live monitor for Mangystau logistics.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FreightRequestIn(BaseModel):
    cargo_type: str = Field(..., examples=["металлопрокат"])
    weight_tons: float = Field(..., gt=0, le=80)
    pickup_location: str | None = Field(None, examples=["Актау"])
    pickup: str | None = None
    delivery_loc: str | None = Field(None, examples=["Ашхабад (ТМ)"])
    delivery: str | None = None
    desired_date: date
    budget_kzt: float = Field(..., gt=0)
    via_checkpoint: str | None = None

    @model_validator(mode="after")
    def normalize_locations(self) -> "FreightRequestIn":
        self.pickup_location = self.pickup_location or self.pickup
        self.delivery_loc = self.delivery_loc or self.delivery
        if not self.pickup_location:
            raise ValueError("pickup_location is required")
        if not self.delivery_loc:
            raise ValueError("delivery_loc is required")
        return self


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


class ChatResponse(BaseModel):
    reply: str
    provider: Literal["anthropic", "gemini", "heuristic"]


FREIGHT_REQUESTS: list[dict] = []
DELETED_ROUTE_IDS: set[str] = set()


CHAT_SYSTEM = """Ты — помощник водителя-дальнобойщика для маршрутов через
Мангистаускую область Казахстана. Отвечай кратко, на русском языке,
используй текущие данные КПП и советуй конкретный пункт пропуска."""


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(simulate_realtime(interval_seconds=20))


def parse_period(period: str) -> int:
    if period.endswith("d") and period[:-1].isdigit():
        return max(1, min(90, int(period[:-1])))
    return 30


def visible_routes(mode: Literal["truck", "rail", "all"] = "all") -> list[dict]:
    routes = [route for route in ROUTES if route["id"] not in DELETED_ROUTE_IDS]
    if mode == "all":
        return routes
    return [route for route in routes if route["mode"] == mode]


def summarize_metrics(rows: list[dict]) -> dict:
    by_day: dict[str, float] = {}
    by_type: dict[str, float] = {}
    by_direction: dict[str, float] = {}
    for row in rows:
        by_day[row["recorded_date"]] = by_day.get(row["recorded_date"], 0) + row["cargo_volume_tons"]
        by_type[row["cargo_type"]] = by_type.get(row["cargo_type"], 0) + row["cargo_volume_tons"]
        by_direction[row["direction"]] = by_direction.get(row["direction"], 0) + row["cargo_volume_tons"]
    return {
        "by_day": [{"date": key, "tons": round(value, 0)} for key, value in by_day.items()],
        "cargo_mix": [{"name": key, "tons": round(value, 0)} for key, value in by_type.items()],
        "direction_mix": [{"name": key, "tons": round(value, 0)} for key, value in by_direction.items()],
        "raw": rows,
    }


def route_recommendation(cargo_type: str, delivery_loc: str) -> dict:
    checkpoints = current_checkpoints()
    land_points = [row for row in checkpoints if row["type"] == "land"]
    best_land = min(land_points, key=lambda row: (row["wait_minutes"], row["current_queue"]))
    preferred_route_id = "aktau-tazhen" if best_land["id"] == 3 else "aktau-karabogaz"
    route = next((item for item in visible_routes("truck") if item["id"] == preferred_route_id), None)
    route = route or next(iter(visible_routes("truck")), None)
    return {
        "checkpoint_id": best_land["id"],
        "checkpoint_name": best_land["name"],
        "route_name": route["name"] if route else "Маршрут не выбран",
        "distance_km": route["distance_km"] if route else 0,
        "current_queue": best_land["current_queue"],
        "wait_minutes": best_land["wait_minutes"],
        "reason": f"Для груза '{cargo_type}' в направлении {delivery_loc} сейчас меньше ожидание через {best_land['name']}.",
    }


def carrier_matches(cargo_type: str) -> list[dict]:
    def score(carrier: dict) -> float:
        spec_bonus = 1.0 if carrier["specialization"] == cargo_type else 0.0
        capacity_bonus = min(carrier["trucks_count"] / 70, 1.0)
        return carrier["rating"] + spec_bonus + capacity_bonus

    return sorted((carrier for carrier in CARRIERS if carrier["active"]), key=score, reverse=True)[:3]


def checkpoint_context(checkpoints: list[dict]) -> str:
    return "\n".join(
        (
            f"- {row['name']} ({row['type']}): очередь {row['current_queue']} авто, "
            f"ожидание {row['wait_minutes']} мин, статус: {row['status']}"
        )
        for row in checkpoints
    )


def load_pct(row: dict) -> int:
    return round(row["current_queue"] / max(row["capacity_per_hour"], 1) * 100)


def find_checkpoint_by_message(message: str, checkpoints: list[dict]) -> dict | None:
    aliases = {
        "карабогаз": "Карабогаз",
        "karabogaz": "Карабогаз",
        "тажен": "Тажен",
        "tazhen": "Тажен",
        "порт": "Порт",
        "aktau": "Актау",
        "актау": "Актау",
    }
    for alias, needle in aliases.items():
        if alias in message:
            return next((row for row in checkpoints if needle in row["name"]), None)
    return None


def exact_chat_reply(message: str, checkpoints: list[dict]) -> str | None:
    text = message.lower()
    land_points = [row for row in checkpoints if row["type"] == "land"]
    candidates = land_points or checkpoints

    if any(word in text for word in ("перегруз", "загруж", "критич", "нагруз")):
        overloaded = [row for row in checkpoints if row["current_queue"] / max(row["capacity_per_hour"], 1) >= 0.8]
        if not overloaded:
            avg_wait = round(sum(row["wait_minutes"] for row in checkpoints) / max(len(checkpoints), 1))
            return f"Перегрузки нет. Среднее ожидание по точкам — {avg_wait} мин, все КПП ниже порога 80% загрузки."
        details = "; ".join(
            f"{row['name']} — {load_pct(row)}%, очередь {row['current_queue']} авто, ожидание {row['wait_minutes']} мин"
            for row in sorted(overloaded, key=lambda item: load_pct(item), reverse=True)
        )
        return f"Да, перегрузка есть: {details}. Порог перегрузки — 80% от пропускной способности."

    target = find_checkpoint_by_message(text, checkpoints)
    if target and any(word in text for word in ("сколько", "ждать", "ожид", "очеред")):
        return (
            f"{target['name']}: очередь {target['current_queue']} авто, ожидание {target['wait_minutes']} мин, "
            f"загрузка {load_pct(target)}%, статус {target['status']}."
        )

    if any(word in text for word in ("когда", "время", "ехать")):
        best = min(candidates, key=lambda row: (row["wait_minutes"], row["current_queue"]))
        if best["wait_minutes"] < 60:
            return (
                f"Лучше ехать сейчас через {best['name']}: ожидание {best['wait_minutes']} мин, "
                f"очередь {best['current_queue']} авто."
            )
        recommended_time = (datetime.now() + timedelta(minutes=best["wait_minutes"])).strftime("%H:%M")
        return (
            f"Лучше планировать въезд после {recommended_time} через {best['name']}. "
            f"Сейчас там ожидание {best['wait_minutes']} мин и очередь {best['current_queue']} авто."
        )

    if any(word in text for word in ("свобод", "лучше", "оптим")):
        best = min(candidates, key=lambda row: (row["wait_minutes"], row["current_queue"]))
        return (
            f"Сейчас свободнее всего {best['name']}: ожидание {best['wait_minutes']} мин, "
            f"очередь {best['current_queue']} авто, загрузка {load_pct(best)}%."
        )

    if "маршрут" in text:
        best = min(candidates, key=lambda row: (row["wait_minutes"], row["current_queue"]))
        route_name = "Актау - КПП Тажен - Ашхабад" if "Тажен" in best["name"] else "Актау - КПП Карабогаз - Туркменбаши"
        return (
            f"Выбирайте маршрут {route_name}. Сейчас контрольная точка {best['name']}: "
            f"{best['wait_minutes']} мин ожидания, очередь {best['current_queue']} авто, загрузка {load_pct(best)}%."
        )

    return None


def fallback_chat_reply(message: str, checkpoints: list[dict]) -> str:
    text = message.lower()
    exact = exact_chat_reply(text, checkpoints)
    if exact:
        return exact

    target = find_checkpoint_by_message(text, checkpoints)

    if target is None:
        candidates = [row for row in checkpoints if row["type"] == "land"] or checkpoints
        target = min(candidates, key=lambda row: (row["wait_minutes"], row["current_queue"]))

    if target["wait_minutes"] < 60:
        action = "можно ехать сейчас"
    else:
        action = "лучше выезжать позже, когда очередь спадет"
    return (
        f"Сейчас оптимальный вариант: {target['name']}. "
        f"Очередь {target['current_queue']} авто, ожидание около {target['wait_minutes']} мин — {action}."
    )


async def gemini_chat_reply(message: str, checkpoints: list[dict]) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    configured = os.getenv("GEMINI_MODELS") or os.getenv("GEMINI_MODEL") or ""
    models = [item.strip().removeprefix("models/") for item in configured.split(",") if item.strip()]
    models.extend(["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash-lite"])
    models = list(dict.fromkeys(models))

    payload = {
        "systemInstruction": {
            "parts": [
                {
                    "text": f"{CHAT_SYSTEM}\n\nТекущее состояние КПП:\n{checkpoint_context(checkpoints)}",
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": message}],
            }
        ],
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": 300,
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        for model in models:
            try:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    params={"key": api_key},
                    json=payload,
                )
                if response.status_code in {429, 503}:
                    continue
                response.raise_for_status()
                data = response.json()
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                text = "".join(part.get("text", "") for part in parts).strip()
                if text:
                    return text
            except Exception:
                continue
    return None


@app.get("/")
async def root():
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"ok": True, "service": "Mangystau Logistics API", "docs": "/docs"}


@app.get("/api/checkpoints")
async def get_checkpoints() -> list[dict]:
    return current_checkpoints()


@app.get("/api/checkpoints/{checkpoint_id}/status")
async def get_checkpoint_status(checkpoint_id: int) -> dict:
    try:
        checkpoint = get_checkpoint_static(checkpoint_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Checkpoint not found") from exc
    return {
        **status_for(checkpoint),
        "history_24h": checkpoint_history(checkpoint_id, 24),
    }


@app.get("/api/checkpoints/{checkpoint_id}/forecast")
async def get_checkpoint_forecast(checkpoint_id: int) -> dict:
    try:
        checkpoint = get_checkpoint_static(checkpoint_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Checkpoint not found") from exc
    current = status_for(checkpoint)
    history = checkpoint_history(checkpoint_id, 24)
    return await forecast_checkpoint(checkpoint["name"], checkpoint_id, history, current["current_queue"])


@app.post("/api/ai/forecast/{checkpoint_id}")
async def post_ai_forecast(checkpoint_id: int) -> dict:
    try:
        checkpoint = get_checkpoint_static(checkpoint_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Checkpoint not found") from exc
    current = status_for(checkpoint)
    history = checkpoint_history(checkpoint_id, 168)
    return await ai_card_forecast(
        checkpoint_name=checkpoint["name"],
        checkpoint_id=checkpoint_id,
        history=history,
        current_queue=current["current_queue"],
        wait_minutes=current["wait_minutes"],
    )


@app.get("/api/chatbot/health")
async def chatbot_health() -> dict:
    return {
        "ok": True,
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "anthropic_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest"),
    }


@app.post("/api/chatbot")
async def chat(req: ChatRequest) -> ChatResponse:
    checkpoints = current_checkpoints()
    exact_reply = exact_chat_reply(req.message, checkpoints)
    if exact_reply:
        return ChatResponse(reply=exact_reply, provider="heuristic")

    try:
        gemini_reply = await gemini_chat_reply(req.message, checkpoints)
        if gemini_reply:
            return ChatResponse(reply=gemini_reply, provider="gemini")
    except Exception:
        pass

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return ChatResponse(reply=fallback_chat_reply(req.message, checkpoints), provider="heuristic")

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
                    "max_tokens": 300,
                    "system": f"{CHAT_SYSTEM}\n\nТекущее состояние КПП:\n{checkpoint_context(checkpoints)}",
                    "messages": [{"role": "user", "content": req.message}],
                },
            )
        response.raise_for_status()
        content = response.json().get("content", [])
        text = content[0].get("text") if content else None
        if text:
            return ChatResponse(reply=text, provider="anthropic")
    except Exception:
        return ChatResponse(reply=fallback_chat_reply(req.message, checkpoints), provider="heuristic")

    return ChatResponse(reply=fallback_chat_reply(req.message, checkpoints), provider="heuristic")


@app.get("/api/port/metrics")
async def get_port_metrics(period: str = Query("30d")) -> dict:
    rows = port_metrics(parse_period(period))
    return summarize_metrics(rows)


@app.get("/api/shipments")
async def get_shipments(status: str | None = None) -> list[dict]:
    return shipments(status)


@app.get("/api/carriers")
async def get_carriers(specialization: str | None = None) -> list[dict]:
    carriers = [carrier for carrier in CARRIERS if carrier["active"]]
    if specialization:
        carriers = [carrier for carrier in carriers if carrier["specialization"] == specialization]
    return carriers


@app.get("/api/freight-requests")
async def get_freight_requests(limit: int = Query(10, ge=1, le=50)) -> list[dict]:
    return FREIGHT_REQUESTS[-limit:][::-1]


@app.post("/api/freight-requests", status_code=201)
async def create_freight_request(payload: FreightRequestIn) -> dict:
    request_id = int(datetime.now().timestamp() * 1000)
    recommended_route = route_recommendation(payload.cargo_type, payload.delivery_loc or "")
    created_at = datetime.now().isoformat(timespec="seconds")
    response = {
        "id": request_id,
        "status": "open",
        "created_at": created_at,
        "request": payload.model_dump(mode="json"),
        "recommended_route": recommended_route,
        "top_carriers": carrier_matches(payload.cargo_type),
        "sms_preview": "Заявка отправлена топ-3 перевозчикам: ожидайте отклик до 20 минут.",
    }
    FREIGHT_REQUESTS.append(
        {
            "id": request_id,
            "status": "open",
            "cargo_type": payload.cargo_type,
            "weight_tons": payload.weight_tons,
            "pickup": payload.pickup_location,
            "pickup_location": payload.pickup_location,
            "delivery": payload.delivery_loc,
            "delivery_loc": payload.delivery_loc,
            "desired_date": payload.desired_date.isoformat(),
            "budget_kzt": payload.budget_kzt,
            "via_checkpoint": payload.via_checkpoint or recommended_route["checkpoint_name"],
            "created_at": created_at,
        }
    )
    del FREIGHT_REQUESTS[:-50]
    return response


@app.get("/api/analytics/dashboard")
async def get_dashboard() -> dict:
    metrics = summarize_metrics(port_metrics(14))
    checkpoint_rows = current_checkpoints()
    last_7 = metrics["by_day"][-7:]
    prev_7 = metrics["by_day"][:7]
    total_week = sum(row["tons"] for row in last_7)
    prev_week = max(1, sum(row["tons"] for row in prev_7))
    delta_pct = round((total_week - prev_week) / prev_week * 100, 1)
    avg_wait = round(sum(row["wait_minutes"] for row in checkpoint_rows) / len(checkpoint_rows))
    critical = [row for row in checkpoint_rows if row["status"] == "critical"]
    savings_usd_day = round(200 * 3 * 20 * 0.28)
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "kpi": [
            {
                "label": "Тоннаж за 7 дней",
                "value": f"{total_week:,.0f}".replace(",", " "),
                "unit": "т",
                "delta": f"{delta_pct:+.1f}%",
            },
            {
                "label": "Активные рейсы",
                "value": len(shipments("in_transit")) + len(shipments("at_checkpoint")),
                "unit": "рейсов",
                "delta": "+12",
            },
            {
                "label": "Среднее ожидание",
                "value": avg_wait,
                "unit": "мин",
                "delta": "-18%",
            },
            {
                "label": "Экономия простоя",
                "value": f"${savings_usd_day:,.0f}".replace(",", " "),
                "unit": "/день",
                "delta": "при -28%",
            },
        ],
        "weekly_volume": metrics["by_day"],
        "cargo_mix": metrics["cargo_mix"],
        "checkpoints": checkpoint_rows,
        "alerts": [
            {
                "severity": "high" if row["status"] == "critical" else "medium",
                "title": row["name"],
                "message": f"Очередь {row['current_queue']} ед., ожидание {row['wait_minutes']} мин.",
            }
            for row in critical
        ],
    }


@app.get("/api/analytics/kpi")
async def get_kpi() -> dict:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    last_week_start = week_start - timedelta(days=7)
    rows = port_metrics(14)
    checkpoints = current_checkpoints()

    this_week = 0.0
    last_week = 0.0
    for row in rows:
        recorded_date = date.fromisoformat(row["recorded_date"])
        if recorded_date >= week_start:
            this_week += row["cargo_volume_tons"]
        elif last_week_start <= recorded_date < week_start:
            last_week += row["cargo_volume_tons"]

    baseline = last_week or 1
    growth_pct = round((this_week - baseline) / baseline * 100, 1)
    avg_wait = round(sum(row["wait_minutes"] for row in checkpoints) / max(len(checkpoints), 1))

    return {
        "cargo_this_week_tons": round(this_week),
        "active_shipments": len(shipments("in_transit")) + len(shipments("at_checkpoint")),
        "avg_wait_minutes": avg_wait,
        "week_growth_pct": growth_pct,
        "active_checkpoints": len([row for row in checkpoints if row["status"] in {"open", "busy", "critical"}]),
        "overloaded_checkpoints": len(
            [row for row in checkpoints if row["current_queue"] / max(row["capacity_per_hour"], 1) >= 0.8]
        ),
    }


@app.get("/api/analytics/heatmap")
async def get_heatmap() -> list[dict]:
    return [
        {
            "checkpoint_id": row["id"],
            "name": row["name"],
            "lat": row["lat"],
            "lon": row["lon"],
            "intensity": min(1, row["utilization"] / 1.6),
            "queue_size": row["current_queue"],
            "wait_minutes": row["wait_minutes"],
        }
        for row in current_checkpoints()
    ]


@app.get("/api/routes")
async def get_routes(mode: Literal["truck", "rail", "all"] = "all") -> list[dict]:
    return visible_routes(mode)


@app.delete("/api/routes/{route_id}")
async def delete_route(route_id: str) -> dict:
    route = next((item for item in ROUTES if item["id"] == route_id), None)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    DELETED_ROUTE_IDS.add(route_id)
    return {
        "deleted": route_id,
        "routes": visible_routes("all"),
    }


@app.websocket("/ws/checkpoints")
async def checkpoints_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json({"type": "checkpoint_update", "data": current_checkpoints()})
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
