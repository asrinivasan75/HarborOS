# HarborOS

Maritime awareness and operator decision-support platform for contested littoral defense.

Detect suspicious vessels. Assess risk. Recommend action. Dispatch verification.

## Quick Start

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m app.seed          # Load demo data
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # Starts on http://localhost:3000
```

## Copernicus Setup

Real Sentinel-2 imagery requires Copernicus Data Space credentials. Without them, HarborOS falls back to demo/simulated imagery.

1. Register at `https://dataspace.copernicus.eu`
2. Create an OAuth client at `https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings`
3. Set these backend env vars before starting FastAPI:

```bash
export CDSE_CLIENT_ID="your_client_id"
export CDSE_CLIENT_SECRET="your_client_secret"
```

If you prefer `.env`, put those keys in `backend/.env` before running `uvicorn app.main:app --reload --port 8000`.

run this before starting the backend to verify your credentials and see a sample Sentinel-2 tile URL:

cat > .env <<'EOF'
CDSE_CLIENT_ID=sh-00bcffba-0f93-4c80-afdb-a4472934d1ca
CDSE_CLIENT_SECRET=NlhMrdnBinFDt4UITKEAdTDQImSu0tmk
EOF

## What You'll See

Open `http://localhost:3000` — an operator console showing:

- **Map view** of LA Harbor with ~15 vessels, color-coded by risk
- **Alert feed** with suspicious contacts flagged and triaged
- **Vessel detail panel** with risk score, anomaly signals, and recommended action
- **Verification request** button demonstrating future hardware integration

## Project Structure

```
HarborOS/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application
│   │   ├── database.py          # SQLite setup
│   │   ├── seed.py              # Demo data seeder
│   │   ├── models/              # Domain models (SQLAlchemy + Pydantic)
│   │   ├── services/            # Anomaly detection, risk scoring
│   │   ├── api/                 # Route handlers
│   │   └── data_sources/        # Source adapters (AIS, NOAA, NWS, USCG)
│   └── requirements.txt
├── frontend/                    # Next.js operator dashboard
├── data/demo/                   # Seeded demo fixtures
├── docs/                        # Project docs
│   ├── PROJECT_PLAN.md
│   ├── DEMO_STORY.md
│   ├── DATA_SOURCES.md
│   ├── FAQ.md
│   └── PITCH.md
└── README.md
```

## Why This Matters

Harbors and littoral zones are increasingly contested. Legacy defense systems are expensive, siloed, and slow. HarborOS proves that persistent maritime awareness, smart anomaly detection, and rapid verification loops can be built with software alone — cheaply, quickly, and extensibly.

Every alert is explainable. Every risk score shows its work. Every verification request is a clean API call away from dispatching a real asset. The software layer is the hard part, and it works today.

## Stack

- **Backend**: Python / FastAPI / SQLite (SQLAlchemy)
- **Frontend**: Next.js / TypeScript / Tailwind / MapLibre GL
- **Data**: Seeded fixtures with adapters for AIS, NOAA, NWS, USCG sources

## License

Proprietary — Hackathon MVP
