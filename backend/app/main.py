from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
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


FREIGHT_REQUESTS: list[dict] = []


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(simulate_realtime(interval_seconds=20))


def parse_period(period: str) -> int:
    if period.endswith("d") and period[:-1].isdigit():
        return max(1, min(90, int(period[:-1])))
    return 30


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
    route = ROUTES[1] if best_land["id"] == 3 else ROUTES[0]
    return {
        "checkpoint_id": best_land["id"],
        "checkpoint_name": best_land["name"],
        "route_name": route["name"],
        "distance_km": route["distance_km"],
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


@app.get("/")
async def root() -> dict:
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
    if mode == "all":
        return ROUTES
    return [route for route in ROUTES if route["mode"] == mode]


@app.websocket("/ws/checkpoints")
async def checkpoints_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json({"type": "checkpoint_update", "data": current_checkpoints()})
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return
