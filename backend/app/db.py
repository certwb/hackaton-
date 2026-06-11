from __future__ import annotations

import json
import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

try:
    import asyncpg
except ModuleNotFoundError:  # pragma: no cover - local fallback when deps are not installed yet.
    asyncpg = None  # type: ignore[assignment]


pool: Any | None = None
last_error: str | None = None


def _database_url() -> str | None:
    return os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")


def _normalize_dsn(dsn: str) -> tuple[str, str | bool | None]:
    parts = urlsplit(dsn)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    normalized = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    if sslmode in {"require", "verify-ca", "verify-full"}:
        return normalized, True
    if sslmode in {"disable", "allow", "prefer"}:
        return normalized, None
    return dsn, None


async def connect_database() -> bool:
    global pool, last_error
    dsn = _database_url()
    if not dsn or asyncpg is None:
        last_error = None if not dsn else "asyncpg is not installed"
        return False

    try:
        normalized_dsn, ssl = _normalize_dsn(dsn)
        pool = await asyncpg.create_pool(dsn=normalized_dsn, min_size=1, max_size=5, ssl=ssl)
        await init_schema()
        last_error = None
        return True
    except Exception as exc:  # Keep MVP alive even if database is not configured correctly.
        pool = None
        last_error = str(exc)
        print(f"PostgreSQL disabled: {exc}")
        return False


async def disconnect_database() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None


def database_enabled() -> bool:
    return pool is not None


async def init_schema() -> None:
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS freight_requests (
              id BIGSERIAL PRIMARY KEY,
              status TEXT NOT NULL DEFAULT 'open',
              cargo_type TEXT NOT NULL,
              weight_tons NUMERIC(10,2) NOT NULL,
              pickup_location TEXT NOT NULL,
              delivery_loc TEXT NOT NULL,
              desired_date DATE NOT NULL,
              budget_kzt NUMERIC(14,2) NOT NULL,
              via_checkpoint TEXT,
              request JSONB NOT NULL DEFAULT '{}'::jsonb,
              recommended_route JSONB NOT NULL DEFAULT '{}'::jsonb,
              top_carriers JSONB NOT NULL DEFAULT '[]'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE freight_requests ADD COLUMN IF NOT EXISTS via_checkpoint TEXT;
            ALTER TABLE freight_requests ADD COLUMN IF NOT EXISTS request JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE freight_requests ADD COLUMN IF NOT EXISTS recommended_route JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE freight_requests ADD COLUMN IF NOT EXISTS top_carriers JSONB NOT NULL DEFAULT '[]'::jsonb;

            CREATE TABLE IF NOT EXISTS deleted_routes (
              route_id TEXT PRIMARY KEY,
              deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_freight_requests_created_at
              ON freight_requests (created_at DESC);
            """
        )


async def list_deleted_route_ids() -> set[str]:
    if pool is None:
        return set()
    rows = await pool.fetch("SELECT route_id FROM deleted_routes")
    return {row["route_id"] for row in rows}


async def save_deleted_route(route_id: str) -> None:
    if pool is None:
        return
    await pool.execute(
        """
        INSERT INTO deleted_routes (route_id)
        VALUES ($1)
        ON CONFLICT (route_id) DO UPDATE SET deleted_at = NOW()
        """,
        route_id,
    )


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


async def create_freight_request(row: dict[str, Any]) -> int | None:
    if pool is None:
        return None
    created_at = _parse_datetime(row["created_at"])
    request_id = await pool.fetchval(
        """
        INSERT INTO freight_requests (
          status, cargo_type, weight_tons, pickup_location, delivery_loc,
          desired_date, budget_kzt, via_checkpoint, request, recommended_route,
          top_carriers, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12)
        RETURNING id
        """,
        row["status"],
        row["cargo_type"],
        row["weight_tons"],
        row["pickup_location"],
        row["delivery_loc"],
        _parse_date(row["desired_date"]),
        row["budget_kzt"],
        row["via_checkpoint"],
        _json_dump(row.get("request", {})),
        _json_dump(row.get("recommended_route", {})),
        _json_dump(row.get("top_carriers", [])),
        created_at,
    )
    return int(request_id) if request_id is not None else None


async def list_freight_requests(limit: int) -> list[dict[str, Any]]:
    if pool is None:
        return []
    rows = await pool.fetch(
        """
        SELECT
          id, status, cargo_type, weight_tons, pickup_location, delivery_loc,
          desired_date, budget_kzt, via_checkpoint, created_at
        FROM freight_requests
        ORDER BY created_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [_row_to_freight_summary(row) for row in rows]


async def health() -> dict[str, Any]:
    configured = bool(_database_url())
    if pool is None:
        return {
            "configured": configured,
            "connected": False,
            "error": last_error,
        }
    async with pool.acquire() as conn:
        freight_count = await conn.fetchval("SELECT COUNT(*) FROM freight_requests")
        deleted_count = await conn.fetchval("SELECT COUNT(*) FROM deleted_routes")
    return {
        "configured": configured,
        "connected": True,
        "freight_requests": int(freight_count or 0),
        "deleted_routes": int(deleted_count or 0),
    }


def _parse_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value))


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _row_to_freight_summary(row: Any) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "status": row["status"],
        "cargo_type": row["cargo_type"],
        "weight_tons": _to_jsonable(row["weight_tons"]),
        "pickup": row["pickup_location"],
        "pickup_location": row["pickup_location"],
        "delivery": row["delivery_loc"],
        "delivery_loc": row["delivery_loc"],
        "desired_date": _to_jsonable(row["desired_date"]),
        "budget_kzt": _to_jsonable(row["budget_kzt"]),
        "via_checkpoint": row["via_checkpoint"],
        "created_at": _to_jsonable(row["created_at"]),
    }
