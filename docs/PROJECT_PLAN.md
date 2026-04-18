# HarborOS — Project Plan

## Overview

HarborOS is a maritime awareness and operator decision-support platform for contested littoral defense. It detects suspicious vessels, scores their risk, recommends operator actions, and provides a clean interface for future verification assets.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Operator Dashboard                 │
│  (Next.js + TypeScript + Tailwind + MapLibre GL)     │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Map View  │  │Alert Feed│  │ Vessel Detail     │  │
│  │ + Overlay │  │ + Actions│  │ + Risk + Actions  │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │ REST API
┌───────────────────────┴─────────────────────────────┐
│                   FastAPI Backend                     │
│                                                       │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Ingestion  │  │  Anomaly     │  │    Risk      │ │
│  │ Layer      │  │  Detection   │  │   Scoring    │ │
│  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘ │
│        │                │                  │          │
│  ┌─────┴────────────────┴──────────────────┴───────┐ │
│  │              Domain Models / DB (SQLite)          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Data Source Adapters (AIS, NOAA, NWS, USCG)     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Verification Stubs (Asset Registry, Tasks)       │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | Python 3.11+ / FastAPI | Fast to build, good typing, async-ready |
| Frontend | Next.js 14 / TypeScript / Tailwind | Modern React, SSR-ready, great DX |
| Map | MapLibre GL JS | Open-source, no API key required, vector tiles |
| Database | SQLite (via SQLAlchemy) | Zero-config, swappable to Postgres later |
| API | REST (JSON) | Simple, sufficient for MVP |
| Dev Env | Docker Compose (optional) | One-command startup |

## Data Flow

1. **Ingestion**: Source adapters load AIS position reports + vessel metadata into SQLite
2. **Detection**: Anomaly engine runs heuristic rules against recent positions
3. **Scoring**: Risk scorer combines anomaly signals + metadata into a composite score
4. **Alerting**: High-scoring contacts generate alerts with explanations
5. **Presentation**: Dashboard displays map, alert feed, detail panels
6. **Action**: Operator acknowledges, monitors, or requests verification (stubbed)

## MVP Boundaries

### In scope
- Map-based vessel view with position trails
- Heuristic anomaly detection (geofence, loitering, speed, heading)
- Composite risk scoring with explanations
- Alert feed with severity + recommended actions
- Vessel detail panel
- Mocked verification request flow
- Scenario/replay mode with seeded data
- Dark-mode operator console UI

### Out of scope
- Auth / multi-tenancy
- Real-time WebSocket streaming
- Hardware integration (cameras, drones, USVs)
- ML training pipelines
- Cloud deployment / CI/CD
- Video streaming

## Module Boundaries

- `backend/app/models/` — SQLAlchemy + Pydantic domain models
- `backend/app/services/` — Anomaly detection, risk scoring, alert generation
- `backend/app/api/` — FastAPI route handlers
- `backend/app/data_sources/` — Source adapters with common interface
- `data/demo/` — Seeded fixture data for demo scenarios
- `frontend/` — Next.js operator dashboard
