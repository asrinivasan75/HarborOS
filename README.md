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

## API Keys & External Services

HarborOS ships runnable out of the box — seeded demo data, simulated satellite imagery, and a static scenario. To plug it into live data sources, set the following environment variables before starting the backend.

| Variable | Purpose | Required? | Source |
|----------|---------|-----------|--------|
| `AISSTREAM_API_KEY` | Live AIS vessel tracks across nine sectors | Recommended | [aisstream.io](https://aisstream.io/) |
| `CDSE_CLIENT_ID` | Real Sentinel-2 optical imagery (verification overlays) | Optional | [dataspace.copernicus.eu](https://dataspace.copernicus.eu) |
| `CDSE_CLIENT_SECRET` | Paired secret for Copernicus OAuth | Optional | (same) |
| `HARBOROS_DB` | Custom SQLite path | Optional | Defaults to `./harboros.db` |

US National Weather Service (NWS) is used for wind/visibility context and requires no key. If the feed is unreachable the vessel panel silently drops the weather row.

### 1. AISStream — live vessel traffic (recommended)

Without this, the map shows seeded demo vessels only. With it, real-time AIS tracks stream into all nine sectors.

1. Sign up at [aisstream.io](https://aisstream.io/) — free tier works for development.
2. Copy the API key from the dashboard.
3. Export before starting the backend:

```bash
export AISSTREAM_API_KEY="your_aisstream_key"
```

The ingest banner on the dashboard shows `CONNECTED · AISSTREAM` once the handshake succeeds. Expect vessels to populate over a minute or two as they broadcast.

### 2. Copernicus Sentinel-2 — real satellite imagery (optional)

Without this, the **Verify** action on a vessel returns simulated imagery marked `simulated` in the panel. With it, the verification fetches the latest real Sentinel-2 scene for the vessel's location and overlays it on the map.

1. Register at [dataspace.copernicus.eu](https://dataspace.copernicus.eu) — free, no wait.
2. Go to **User Settings → OAuth clients → Create client**. Name it (e.g. `harboros-dev`).
3. Copy the generated `client_id` and `client_secret`.
4. Export before starting the backend:

```bash
export CDSE_CLIENT_ID="your_client_id"
export CDSE_CLIENT_SECRET="your_client_secret"
```

When configured, the Satellite Imagery chip in the vessel panel flips from `simulated` to `real` and tiles render at 10m resolution.

### 3. Putting it all together

Drop the exports into a `.env` file in `backend/` and source it, or add them to your shell profile:

```bash
# backend/.env
AISSTREAM_API_KEY=your_aisstream_key
CDSE_CLIENT_ID=your_client_id
CDSE_CLIENT_SECRET=your_client_secret
```

```bash
set -a && source backend/.env && set +a
./start.sh
```

Nothing here is required to run the demo — HarborOS is fully functional without any keys, it just operates on seeded data and simulated imagery.

## References

- **Loitering**: "Loitering Behavior Detection by Spatiotemporal Characteristics" (PMC 2023, 97% accuracy)
- **Collision Risk**: Mou et al. 2021, exponential CPA formula with F_angle encounter geometry
- **AIS Intervals**: IMO Resolution A.1106(29), ITU-R M.1371
- **Dark Vessels**: Global Fishing Watch (55,000+ deliberate AIS disabling events/year)
- **Anomaly Survey**: Stach et al. 2023 maritime anomaly detection survey
- **MARSEC Levels**: ISPS Code (International Ship and Port Facility Security)

## License

Proprietary
