from __future__ import annotations

from datetime import date, datetime, timedelta
from math import exp
from random import Random


LIVE_STATE: dict[int, dict] = {}
LIVE_LOG: dict[int, list[dict]] = {}


CHECKPOINTS = [
    {
        "id": 1,
        "name": "Порт Актау",
        "type": "sea",
        "lat": 43.6529,
        "lon": 51.1722,
        "capacity_per_hour": 120,
        "base_queue": 28,
        "note": "Единственный морской порт Казахстана на Каспии",
    },
    {
        "id": 2,
        "name": "КПП Карабогаз",
        "type": "land",
        "lat": 41.5667,
        "lon": 52.5333,
        "capacity_per_hour": 40,
        "base_queue": 45,
        "note": "Граница с Туркменистаном, основной южный КПП",
    },
    {
        "id": 3,
        "name": "КПП Тажен",
        "type": "land",
        "lat": 44.8922,
        "lon": 55.9819,
        "capacity_per_hour": 30,
        "base_queue": 16,
        "note": "Граница с Узбекистаном, направление Даут-Ата / Каракалпакстан",
    },
    {
        "id": 4,
        "name": "Ж/д ст. Мангышлак",
        "type": "rail",
        "lat": 43.7900,
        "lon": 51.2300,
        "capacity_per_hour": 15,
        "base_queue": 8,
        "note": "Основная ж/д станция региона",
    },
    {
        "id": 5,
        "name": "Ж/д ст. Опорная",
        "type": "rail",
        "lat": 43.6400,
        "lon": 51.0800,
        "capacity_per_hour": 10,
        "base_queue": 6,
        "note": "Сортировочная станция у порта",
    },
]

CARGO_TYPES = [
    "нефтепродукты",
    "зерно",
    "контейнеры",
    "металлопрокат",
    "химикаты",
    "строительные материалы",
]

ORIGINS = [
    "Актобе",
    "Атырау",
    "Алматы",
    "Астана",
    "Баку (АЗ)",
    "Туркменбаши (ТМ)",
    "Ченгду (КН)",
]

DESTINATIONS = [
    "Ашхабад (ТМ)",
    "Баку (АЗ)",
    "Тбилиси (ГЕ)",
    "Стамбул (ТР)",
    "Варшава (ПЛ)",
    "Алматы (КЗ)",
]

CARRIERS = [
    {
        "id": 1,
        "company_name": "Caspian Trans Service",
        "bin": "150840011234",
        "trucks_count": 64,
        "specialization": "нефтепродукты",
        "rating": 4.8,
        "phone": "+7 701 110 45 45",
        "active": True,
    },
    {
        "id": 2,
        "company_name": "Mangystau Cargo Line",
        "bin": "180240019876",
        "trucks_count": 41,
        "specialization": "металлопрокат",
        "rating": 4.5,
        "phone": "+7 7292 55 12 10",
        "active": True,
    },
    {
        "id": 3,
        "company_name": "Aktau Container Express",
        "bin": "190640014411",
        "trucks_count": 35,
        "specialization": "контейнеры",
        "rating": 4.7,
        "phone": "+7 777 323 70 90",
        "active": True,
    },
    {
        "id": 4,
        "company_name": "Silk Road Grain Logistics",
        "bin": "120340021553",
        "trucks_count": 28,
        "specialization": "зерно",
        "rating": 4.4,
        "phone": "+7 701 812 41 02",
        "active": True,
    },
    {
        "id": 5,
        "company_name": "South Gate Freight",
        "bin": "210740018845",
        "trucks_count": 22,
        "specialization": "строительные материалы",
        "rating": 4.2,
        "phone": "+7 705 442 19 33",
        "active": True,
    },
]

ROUTES = [
    {
        "id": "aktau-karabogaz",
        "name": "Актау - КПП Карабогаз - Туркменбаши",
        "mode": "truck",
        "distance_km": 350,
        "path": [
            [43.6529, 51.1722],
            [43.6500, 51.2350],
            [43.6350, 51.3150],
            [43.6100, 51.3900],
            [43.6200, 51.4500],
            [43.5400, 51.5550],
            [43.4600, 51.6650],
            [43.3800, 51.7800],
            [43.3000, 51.9000],
            [43.2200, 52.0200],
            [43.1200, 52.1400],
            [42.9800, 52.2450],
            [42.8200, 52.3300],
            [42.6400, 52.3950],
            [42.4300, 52.4450],
            [42.1800, 52.4850],
            [41.9300, 52.5200],
            [41.7200, 52.5450],
            [41.6300, 52.5380],
            [41.5667, 52.5333],
        ],
    },
    {
        "id": "aktau-tazhen",
        "name": "Актау - Бейнеу - КПП Тажен - Даут-Ата",
        "mode": "truck",
        "distance_km": 557,
        "path": [
            [43.6529, 51.1722],
            [43.7600, 51.3500],
            [44.0000, 51.8500],
            [44.2600, 52.3800],
            [44.5200, 52.9300],
            [44.7600, 53.4500],
            [44.9800, 54.0500],
            [45.1600, 54.6500],
            [45.3167, 55.2000],
            [45.2500, 55.4200],
            [45.1200, 55.6500],
            [45.0000, 55.8200],
            [44.8922, 55.9819],
        ],
    },
    {
        "id": "port-mangyshlak",
        "name": "Порт Актау - Мангышлак - ТМТМ",
        "mode": "rail",
        "distance_km": 24,
        "path": [
            [43.6529, 51.1722],
            [43.7000, 51.2000],
            [43.7900, 51.2300],
        ],
    },
]


def queue_curve(hour: float, base: int, seed: int) -> int:
    """Synthetic load curve: morning/evening peaks, low night traffic."""
    morning_peak = 40 * exp(-((hour - 8.5) ** 2) / 4)
    evening_peak = 35 * exp(-((hour - 16) ** 2) / 5)
    night_drop = 12 if hour < 5 or hour > 22 else 0
    noise = Random(seed).randint(-5, 6)
    return max(0, int(base + morning_peak + evening_peak + noise - night_drop))


def get_checkpoint_static(checkpoint_id: int) -> dict:
    for checkpoint in CHECKPOINTS:
        if checkpoint["id"] == checkpoint_id:
            return checkpoint
    raise KeyError(checkpoint_id)


def status_for(checkpoint: dict, moment: datetime | None = None) -> dict:
    if moment is None and checkpoint["id"] in LIVE_STATE:
        return LIVE_STATE[checkpoint["id"]].copy()

    moment = moment or datetime.now()
    minute_bucket = moment.minute // 2
    hour = moment.hour + moment.minute / 60
    seed = int(moment.strftime("%Y%m%d%H")) * 100 + checkpoint["id"] * 7 + minute_bucket
    queue = queue_curve(hour, checkpoint["base_queue"], seed)
    utilization = queue / max(checkpoint["capacity_per_hour"], 1)
    wait_minutes = int(utilization * 90)
    if wait_minutes >= 150 or utilization >= 1.45:
        status = "critical"
    elif wait_minutes >= 65 or utilization >= 0.75:
        status = "busy"
    else:
        status = "open"
    return {
        **{k: v for k, v in checkpoint.items() if k != "base_queue"},
        "current_queue": queue,
        "wait_minutes": wait_minutes,
        "utilization": round(utilization, 2),
        "status": status,
        "updated_at": moment.isoformat(timespec="seconds"),
    }


def set_live_checkpoint_status(checkpoint_id: int, queue: int, wait_minutes: int, moment: datetime | None = None) -> dict:
    checkpoint = get_checkpoint_static(checkpoint_id)
    moment = moment or datetime.now()
    utilization = queue / max(checkpoint["capacity_per_hour"], 1)
    if wait_minutes >= 150 or utilization >= 1.45:
        status = "critical"
    elif wait_minutes >= 65 or utilization >= 0.75:
        status = "busy"
    else:
        status = "open"
    row = {
        **{k: v for k, v in checkpoint.items() if k != "base_queue"},
        "current_queue": max(0, int(queue)),
        "wait_minutes": max(0, int(wait_minutes)),
        "utilization": round(utilization, 2),
        "status": status,
        "updated_at": moment.isoformat(timespec="seconds"),
    }
    LIVE_STATE[checkpoint_id] = row
    LIVE_LOG.setdefault(checkpoint_id, []).append(
        {
            "logged_at": moment.isoformat(timespec="seconds"),
            "hour": moment.strftime("%H:%M"),
            "queue_size": row["current_queue"],
            "wait_minutes": row["wait_minutes"],
            "trucks_passed": max(0, min(checkpoint["capacity_per_hour"], checkpoint["capacity_per_hour"] - row["current_queue"] // 3)),
        }
    )
    LIVE_LOG[checkpoint_id] = LIVE_LOG[checkpoint_id][-240:]
    return row


def current_checkpoints() -> list[dict]:
    return [status_for(checkpoint) for checkpoint in CHECKPOINTS]


def checkpoint_history(checkpoint_id: int, hours: int = 24) -> list[dict]:
    checkpoint = get_checkpoint_static(checkpoint_id)
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    rows: list[dict] = []
    for offset in range(hours - 1, -1, -1):
        moment = now - timedelta(hours=offset)
        row = status_for(checkpoint, moment)
        rows.append(
            {
                "logged_at": moment.isoformat(timespec="seconds"),
                "hour": moment.strftime("%H:00"),
                "queue_size": row["current_queue"],
                "wait_minutes": row["wait_minutes"],
                "trucks_passed": max(
                    3,
                    min(
                        checkpoint["capacity_per_hour"],
                        int(checkpoint["capacity_per_hour"] * (0.72 + Random(offset + checkpoint_id).random() * 0.25)),
                    ),
                ),
            }
        )
    live_rows = LIVE_LOG.get(checkpoint_id, [])
    if live_rows:
        rows = rows[:-min(len(live_rows), hours)] + live_rows[-hours:]
    return rows


def forecast_rows(checkpoint_id: int, hours: int = 6) -> list[dict]:
    checkpoint = get_checkpoint_static(checkpoint_id)
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    rows: list[dict] = []
    for offset in range(1, hours + 1):
        moment = now + timedelta(hours=offset)
        row = status_for(checkpoint, moment)
        rows.append(
            {
                "hour": f"+{offset}h",
                "clock": moment.strftime("%H:%M"),
                "predicted_trucks": row["current_queue"],
                "wait_minutes": row["wait_minutes"],
                "status": row["status"],
            }
        )
    return rows


def daily_port_volume(day: date) -> float:
    rng = Random(int(day.strftime("%Y%m%d")))
    weekday_factor = 0.92 if day.weekday() in (5, 6) else 1.0
    return round(rng.gauss(33000, 3000) * weekday_factor, 2)


def port_metrics(days: int = 30) -> list[dict]:
    today = date.today()
    weights = {
        "нефтепродукты": 0.58,
        "зерно": 0.17,
        "контейнеры": 0.14,
        "металлопрокат": 0.06,
        "химикаты": 0.03,
        "строительные материалы": 0.02,
    }
    rows: list[dict] = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        total = daily_port_volume(day)
        for cargo_type, share in weights.items():
            rng = Random(hash((day.isoformat(), cargo_type)) & 0xFFFFFFFF)
            volume = round(total * share * rng.uniform(0.92, 1.08), 2)
            rows.append(
                {
                    "recorded_date": day.isoformat(),
                    "cargo_volume_tons": volume,
                    "vessels_count": max(1, int(total / 7800 + rng.randint(-1, 2))),
                    "cargo_type": cargo_type,
                    "direction": rng.choice(["import", "export", "transit"]),
                    "dest_country": rng.choice(["Туркменистан", "Азербайджан", "Грузия", "Турция", "Польша", "Казахстан"]),
                }
            )
    return rows


def shipments(status: str | None = None) -> list[dict]:
    now = datetime.now()
    rows = []
    for idx in range(1, 19):
        rng = Random(20240600 + idx)
        checkpoint = CHECKPOINTS[rng.randrange(len(CHECKPOINTS))]
        row_status = rng.choice(["in_transit", "at_checkpoint", "delayed", "completed"])
        row = {
            "id": idx,
            "tracking_number": f"MG-{now.year % 100}{idx:04d}",
            "cargo_type": rng.choice(CARGO_TYPES),
            "weight_tons": round(rng.uniform(12, 58), 1),
            "transport_mode": rng.choice(["truck", "rail", "sea"]),
            "origin": rng.choice(ORIGINS),
            "destination": rng.choice(DESTINATIONS),
            "checkpoint_id": checkpoint["id"],
            "checkpoint_name": checkpoint["name"],
            "status": row_status,
            "created_at": (now - timedelta(hours=rng.randint(2, 70))).isoformat(timespec="seconds"),
            "eta": (now + timedelta(hours=rng.randint(3, 36))).isoformat(timespec="seconds"),
        }
        if status is None or row_status == status:
            rows.append(row)
    return rows
