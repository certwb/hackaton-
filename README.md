# Mangystau Logistics Monitor

MVP для хакатона: дашборд акимата + live-мониторинг КПП Мангистауской области.

## Demo Flow

1. Открыть дашборд: карта показывает порт Актау, КПП Карабогаз, КПП Тажен, ст. Мангышлак и ст. Опорная.
2. Кликнуть `КПП Карабогаз`: справа появится очередь, ожидание, история 24 часа и AI/fallback прогноз на 6 часов.
3. Нажать `CSV`: выгружается утренний отчет для акимата.
4. Внизу создать заявку: `40 т металлопроката, Актау -> Ашхабад`; API вернет лучший КПП и топ-3 перевозчика.

## Local Run

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

API docs:

```text
http://localhost:8000/docs
```

## Environment

AI works in reliable demo mode by default:

```env
AI_PROVIDER=heuristic
```

To use external LLM forecasting:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

or:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

## Deploy

Backend on Render/Railway:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Frontend on Vercel:

```env
VITE_API_URL=https://your-backend.example.com
```

Supabase:

1. Create a PostgreSQL project.
2. Run `backend/migrations/001_schema.sql`.
3. Keep synthetic mode for demo, or replace `backend/app/data/seed.py` calls with SQL queries.

## Pitch Numbers

- Synthetic data uses real coordinates for Port Aktau, Karabogaz, Tazhen, Mangyshlak and Opornaya.
- Port volume is generated around `33 000 tons/day`, which gives about `231 000 tons/week`.
- Queue model has peaks at `07:00-10:00` and `14:00-18:00`.
- Downtime economics: `200 trucks/day x 3h x $20 x 28% = $3 360/day` saved on one checkpoint.

