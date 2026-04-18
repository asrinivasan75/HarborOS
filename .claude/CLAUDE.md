# HarborOS — Project Guide

## Commands

```bash
# Backend
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8000
python -m app.seed    # Load demo data

# Frontend
cd frontend
npm install
npm run dev           # http://localhost:3000

# Both at once
./start.sh
```

## Tech Stack

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite, Pydantic
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, MapLibre GL
- **Architecture:** REST API on port 8000, frontend on port 3000

## Project Structure

```
backend/
  app/
    main.py               # FastAPI entry point
    database.py           # SQLite setup
    seed.py               # Demo data seeder
    models/domain.py      # SQLAlchemy + Pydantic models
    api/routes.py         # Route handlers
    services/             # Core logic
      anomaly_detection.py
      risk_scoring.py
      alert_service.py
      vessel_profiles.py
      pattern_learning.py
      ingestion_service.py
      archive_service.py
    data_sources/         # External data adapters
      aisstream_adapter.py
      sentinel_adapter.py

frontend/
  app/
    page.tsx              # Main dashboard
    components/
      MapView.tsx         # MapLibre GL map
      AlertFeed.tsx       # Alert triage panel
      VesselDetail.tsx    # Vessel info + risk score
      VesselCompare.tsx   # Side-by-side comparison
      DemoMode.tsx        # Demo walkthrough
    lib/api.ts            # API client
```

## Key Modules

- **anomaly_detection.py** — Detects suspicious vessel behavior patterns
- **risk_scoring.py** — Quantifies maritime threats
- **vessel_profiles.py** — Historical behavior tracking
- **MapView.tsx** — Primary operator interface, MapLibre GL

## Git

- Never add Co-Authored-By lines to commit messages
- Keep commit messages short and simple
