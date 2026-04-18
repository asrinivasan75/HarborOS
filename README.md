# HarborOS

Maritime awareness and operator decision-support platform for contested littoral defense.

Detect suspicious vessels. Assess risk. Recommend action. Dispatch verification.

## The Problem

Harbors and littoral zones are increasingly contested. Small, cheap threats — smuggling vessels, hostile reconnaissance, unauthorized intrusions — exploit gaps in maritime awareness. Legacy systems are expensive, siloed, and slow. Operators drown in raw AIS data with no triage, no scoring, and no clear path to action.

## What HarborOS Does

HarborOS turns raw vessel traffic data into operator decisions through a four-stage pipeline:

1. **Detect** — 10 anomaly detectors scan vessel behavior for suspicious patterns
2. **Assess** — A fuzzy logic engine combines signals into a composite risk score (0–100)
3. **Recommend** — MARSEC-aligned action tiers guide operator response
4. **Verify** — Clean integration surface for dispatching verification assets (cameras, patrol boats, drones)

Every alert is explainable. Every risk score shows its work.

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
npm run dev                 # http://localhost:3000

# Or both at once
./start.sh
```

## How the Algorithm Works

### Detection → Aggregation → Fuzzy Inference → Action

```
Position Reports → Anomaly Detectors → Signal Aggregation → Fuzzy Inference → Risk Score → MARSEC Action
                        ↑                      ↑                   ↑
                  Vessel Profiles        Signal Weights       Mamdani Rule Base
                  (type-aware           (defense-priority    (16 fuzzy rules,
                   thresholds)           weighting)           3 input dimensions)
```

### Anomaly Detectors

| Detector | Method | What It Catches |
|----------|--------|-----------------|
| **AIS Gap** | IMO speed-dependent intervals (Res. A.1106) | Vessels going dark — gap vs. mandated reporting rate |
| **Loitering** | F(c) course-change intensity (PMC 2023) | Circling, surveillance, rendezvous behavior |
| **Geofence Breach** | Ray-casting point-in-polygon | Unauthorized entry into restricted/security zones |
| **Kinematic Implausibility** | Position jump vs. physical constraints | GPS spoofing — impossible position changes |
| **Type Mismatch** | Behavior vs. declared vessel type | Identity deception — cargo ship acting like a fishing boat |
| **Speed Anomaly** | Rapid acceleration/deceleration + learned baselines | Evasive maneuvering, data anomalies |
| **Heading Anomaly** | Course change frequency vs. type threshold | Search patterns, erratic maneuvering |
| **Zone Lingering** | Time-in-zone accumulation | Prolonged presence near critical infrastructure |
| **Statistical Outlier** | Z-score deviation from regional fleet | Behavior that doesn't match surrounding traffic |
| **Collision Risk** | Mou et al. 2021 CPA/TCPA with F_angle | COLREGS non-compliance — refusing to yield |
| **Dark Ship (Optical)** | SeaPod edge node optical detection | Vessels with no AIS transponder at all |

All detectors are **vessel-type-aware** — a fishing boat loitering is expected; a cargo ship loitering near an LNG terminal is not. Thresholds adjust per type (cargo, tanker, fishing, tug, passenger, military, high-speed craft).

### Signal Aggregation

Detected signals are weighted by defense relevance:

| Priority | Signals | Weight |
|----------|---------|--------|
| Critical | Dark Ship, AIS Gap | 1.00 |
| High | Spoofing, Geofence Breach, Identity Mismatch | 0.85–0.95 |
| Medium | Route Deviation, Loitering, Zone Lingering | 0.70–0.80 |
| Lower | Speed, Heading, Statistical Outlier, Collision Risk | 0.40–0.60 |

Multiple distinct signal types trigger a **diversity bonus** (8% for 2 types, 18% for 3+), because converging evidence from different detectors is far more suspicious than repeated signals of the same kind.

### Fuzzy Risk Scoring

Three inputs feed a Mamdani fuzzy inference engine:

1. **Anomaly severity** (0–1) — composite from signal aggregation
2. **Metadata deficiency** (0–1) — weighted missing identity fields (IMO, flag, callsign)
3. **Inspection risk** (0–1) — port state control deficiency history

Key design principle: **anomaly severity drives risk**. Metadata gaps and inspection history amplify existing suspicion but don't create risk on their own. A vessel with missing IMO but normal behavior stays low-risk. A vessel with missing IMO *and* AIS gaps near a restricted zone escalates fast.

The engine evaluates 16 fuzzy rules and defuzzifies using a blended centroid + weighted-mean-of-maxima approach to produce a continuous 0–100 score.

### MARSEC Action Tiers

| Score | Action | MARSEC Level | Operator Guidance |
|-------|--------|-------------|-------------------|
| 80–100 | **ESCALATE** | MARSEC 3 | Immediate interdiction response |
| 60–79 | **VERIFY** | MARSEC 2 | Request satellite/asset verification |
| 35–59 | **MONITOR** | MARSEC 1 | Track vessel, log activity |
| 0–34 | **NORMAL** | Below MARSEC 1 | No action needed |

For the full algorithm reference with formulas and thresholds, see [`docs/ALGORITHM.md`](docs/ALGORITHM.md).

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                   Operator Dashboard                   │
│    Next.js · TypeScript · Tailwind · MapLibre GL       │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐  │
│  │ Map View  │  │Alert Feed│  │ Vessel Detail       │  │
│  │ + Heatmap │  │ + Triage │  │ + Risk + Signals    │  │
│  └──────────┘  └──────────┘  └─────────────────────┘  │
└───────────────────────┬───────────────────────────────┘
                        │ REST API
┌───────────────────────┴───────────────────────────────┐
│                   FastAPI Backend                       │
│                                                        │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Ingestion  │  │  Anomaly     │  │  Fuzzy Risk    │ │
│  │ + AISStream│  │  Detection   │  │  Scoring       │ │
│  └─────┬──────┘  └──────┬───────┘  └──────┬─────────┘ │
│        │                │                  │           │
│  ┌─────┴────────────────┴──────────────────┴─────────┐ │
│  │           Domain Models / SQLite                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                        │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Data Adapters: AIS, Sentinel-2, NWS, USCG       │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, MapLibre GL |
| Anomaly Detection | 10 research-backed heuristic detectors |
| Risk Scoring | Mamdani fuzzy inference engine |
| Satellite Imagery | Copernicus Sentinel-2 (optional) |
| Edge Nodes | SeaPod optical detection (experimental) |

## Project Structure

```
HarborOS/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry point
│   │   ├── database.py            # SQLite setup
│   │   ├── seed.py                # Demo data seeder
│   │   ├── models/domain.py       # SQLAlchemy + Pydantic models
│   │   ├── api/routes.py          # REST endpoints
│   │   └── services/
│   │       ├── anomaly_detection.py   # 10 anomaly detectors
│   │       ├── risk_scoring.py        # Signal aggregation + scoring
│   │       ├── fuzzy_risk.py          # Mamdani fuzzy inference engine
│   │       ├── vessel_profiles.py     # Per-type behavior thresholds
│   │       ├── pattern_learning.py    # Historical baseline learning
│   │       ├── alert_service.py       # Alert lifecycle management
│   │       └── ingestion_service.py   # Live AIS stream ingestion
│   └── requirements.txt
├── frontend/
│   └── app/
│       ├── page.tsx               # Main dashboard
│       ├── report/page.tsx        # Incident report (printable)
│       ├── components/
│       │   ├── MapView.tsx        # MapLibre GL map + heatmap
│       │   ├── AlertFeed.tsx      # Alert triage panel
│       │   ├── VesselDetail.tsx   # Vessel info + risk breakdown
│       │   └── RiskDistribution.tsx   # Analytics panel
│       └── lib/
│           ├── api.ts             # API client
│           └── risk.ts            # Shared risk thresholds
├── docs/
│   ├── ALGORITHM.md               # Full algorithm reference
│   ├── DATA_SOURCES.md            # Data source adapters
│   ├── DEMO_STORY.md              # Demo walkthrough script
│   ├── PITCH.md                   # Project pitch
│   └── PROJECT_PLAN.md            # Architecture & plan
└── start.sh                       # Run both servers
```

## Copernicus Setup (Optional)

Real Sentinel-2 satellite imagery requires Copernicus Data Space credentials. Without them, HarborOS falls back to simulated imagery.

1. Register at [dataspace.copernicus.eu](https://dataspace.copernicus.eu)
2. Create an OAuth client in account settings
3. Set env vars before starting the backend:

```bash
export CDSE_CLIENT_ID="your_client_id"
export CDSE_CLIENT_SECRET="your_client_secret"
```

## References

- **Loitering**: "Loitering Behavior Detection by Spatiotemporal Characteristics" (PMC 2023, 97% accuracy)
- **Collision Risk**: Mou et al. 2021, exponential CPA formula with F_angle encounter geometry
- **AIS Intervals**: IMO Resolution A.1106(29), ITU-R M.1371
- **Dark Vessels**: Global Fishing Watch (55,000+ deliberate AIS disabling events/year)
- **Anomaly Survey**: Stach et al. 2023 maritime anomaly detection survey
- **MARSEC Levels**: ISPS Code (International Ship and Port Facility Security)

## License

Proprietary
