# HarborOS FAQ

This FAQ is written for new users, hackathon judges, and teammates onboarding to HarborOS. It combines the current software implementation with the current demo hardware notes, and it explicitly labels when something is a **current implementation** versus a **current demo concept**.

## Overview

### What does HarborOS do?
HarborOS is a maritime monitoring and operator decision-support platform. It tracks vessels, detects anomalous behavior, assigns an explainable risk score, recommends an action, and supports verification workflows.

In the current codebase, that loop is implemented as ingestion, anomaly detection, risk scoring, alert generation, and operator action endpoints. The frontend polls those APIs on a regular interval, so the operator sees a continuously refreshed operating picture even without live camera input.

### How are vessels and alerts shown on the map?
The dashboard renders vessel markers on a MapLibre map, colors them by risk, and overlays geofences such as restricted zones, shipping lanes, and anchorage areas. Alerts are shown in a separate feed and are sorted so operators can triage the highest-risk contacts first.

Selecting a vessel or alert loads a detail panel with anomaly signals, risk history, current position, and optional imagery overlays. The map can also show vessel trails and focus the operator directly on the selected contact, so the alert feed and map stay synchronized.

### What is the difference between Maps, Dark, and Satellite views?
Current implementation: `Maps` uses the default labeled imagery view for general operations, `Dark` uses a high-contrast dark basemap, and `Satellite` uses HarborOS's satellite tile source. When Copernicus is configured, `Satellite` prefers Sentinel-backed tiles; otherwise it falls back to Esri imagery.

### What works without live camera data?
Most of the platform works without any camera or SeaPod input: seeded or live AIS ingestion, map views, geofences, anomaly detection, risk scoring, alerts, operator actions, reports, and satellite workflows. Live camera or edge-node input only adds another detection source; it is not required for the core dashboard loop.

That means the seeded scenario, the operator triage flow, and even the satellite verification UX are all usable before any hardware is connected. SeaPod input enters as an extra source of alerts, not as a prerequisite for the rest of the platform.

## Setup

### What do I need to run HarborOS locally?
You need the backend and frontend running locally, plus Python dependencies for FastAPI and Node dependencies for Next.js. The seeded demo scenario works without live AIS, live camera, or Copernicus credentials, so you can bring up the baseline platform with local tooling only.

### Which environment variables and API credentials are required or optional?
Optional credentials unlock live integrations: `AISSTREAM_API_KEY` enables live AIS ingestion, and `CDSE_CLIENT_ID` plus `CDSE_CLIENT_SECRET` enable Copernicus Sentinel-2 search and imagery. `NEXT_PUBLIC_API_URL` is optional on the frontend and only needed when the API is not served from `http://localhost:8000/api`.

If the AIS key is absent, the backend falls back to seeded-only behavior instead of failing startup. If the Copernicus keys are absent, the dashboard still loads, but live Sentinel search and imagery stay unavailable and the UI uses fallback imagery paths instead.

### How do I start the backend and frontend?
From `backend/`, create a virtual environment, install `requirements.txt`, seed the demo data with `python -m app.seed`, and run `uvicorn app.main:app --reload --port 8000`. From `frontend/`, run `npm install` and `npm run dev`, then open `http://localhost:3000`.

The backend initializes the database on startup and only auto-starts live AIS when `AISSTREAM_API_KEY` is present. The frontend defaults to `http://localhost:8000/api`, so the standard two-terminal local setup works without extra config.

## Core Features

### What makes an event anomalous versus normal vessel behavior?
Current implementation uses detector functions that compare recent vessel behavior against rules for geofences, movement patterns, AIS reporting, nearby traffic, regional statistics, and learned historical corridors. A contact remains "normal" when its recent motion fits its vessel-type profile, its telemetry is plausible, and its composite score stays below the monitor threshold.

The detector set is broader than one threshold rule: it includes geofence breach, loitering, speed anomaly, heading anomaly, AIS gap, dark vessel, zone lingering, kinematic implausibility, statistical outlier, collision risk, route deviation, and type mismatch. That gives HarborOS both immediate heuristics and context-aware checks before it decides something is worth surfacing.

### How are thresholds chosen for monitor, verify, and escalate actions?
The score is mapped to operator actions using fixed thresholds: below 35 is `ignore`, 35-59 is `monitor`, 60-79 is `verify`, and 80+ is `escalate`. Those bands are intentionally aligned to MARSEC-style operator guidance, and the signal aggregator is calibrated so higher bands require multiple strong, defense-relevant signals to converge.

In alert generation, anything below 35 is ignored or resolved, and collision-risk-only cases are explicitly suppressed unless other suspicious context exists. That makes the action bands operational filters, not just labels attached after the fact.

### How do you explain a risk score to a non-technical operator?
HarborOS does not just show a number; it also shows the recommended action, the triggered signals, and a generated explanation string. The explanation leads with the most severe finding in plain language so an operator can understand what happened without reading the scoring code.

That same explanation is reused across the alert feed and vessel detail panel, so the operator gets one consistent narrative instead of several competing summaries. The deeper breakdown still exists in the backend, but the first view remains action-oriented rather than mathematical.

## Satellite Imagery and Verification

### How does satellite verification work?
An operator can create a verification request for a vessel or map focus, and the backend resolves the request to a vessel position or chosen coordinates. Current implementation builds a satellite response using Sentinel-2 data when Copernicus is configured, stores scene metadata, and returns a rendered image reference or a scene placeholder for the UI.

When Sentinel is configured, HarborOS can also search nearby acquisitions, attach metadata such as acquisition time and cloud cover, and build rendered imagery URLs for the map overlay flow. When the operator wants more control than a one-click verification request, the imagery browser can search by vessel area or by the current map focus.

### What happens if Copernicus or Sentinel is not configured?
The satellite basemap falls back to Esri imagery, and the UI clearly marks that state as fallback rather than live Sentinel. Current implementation also simulates verification scene metadata when Sentinel credentials are absent, while direct Sentinel catalog search endpoints stay unavailable until credentials are configured.

In practice, `satellite/info` still returns useful capability data, the general dashboard remains usable, and verification can still demonstrate the workflow with simulated scene metadata. The failure mode is graceful degradation, not a broken map or unusable detail panel.

### Why would satellite imagery search return no results?
The most common reasons are missing Copernicus credentials, a date range with no suitable acquisitions, tight cloud-cover filters, or a search area with no recent catalog hit. The platform may still render a fallback or latest-available mosaic for verification, but the acquisition browser itself can legitimately return an empty result set.

## Camera and Edge Node Input

### How do SeaPod alerts appear in the system?
SeaPod or edge-node detections arrive through `POST /api/edge-node/alert`, which creates or updates a sensor node vessel, a detected target vessel, and a corresponding alert. The frontend then picks that up through its normal polling loop, so the alert appears alongside AIS-derived alerts rather than through a separate UI path.

The backend stores the SeaPod node and the detected contact as separate vessels, computes a risk assessment for the target, and inserts a standard alert record. That means downstream features like alert sorting, vessel detail, map focus, and operator actions work without a special SeaPod-only branch in the frontend.

### Which parts require live external inputs?
Live AIS requires AISStream credentials, live Sentinel search and imagery require Copernicus credentials, and live camera or SeaPod behavior requires an external sender posting alerts or streaming video. The baseline dashboard, seeded scenario, scoring engine, map layers, and operator workflow all work without those live inputs.

A useful way to think about the system is that it separates baseline awareness from live enrichment. The baseline layer is the dashboard, rules engine, seeded data, and operator workflow; live AIS, weather, satellite, and SeaPod feeds enrich that baseline when they are available.

## Hardware and Demo Node

### What is SeaPod, and how does it relate to the ship’s radar?
Current demo concept: SeaPod is a passive optical edge node that supplements, rather than replaces, the ship’s existing radar or ARPA picture. The goal is to keep a ship aware of nearby non-AIS contacts even when radar is unavailable, degraded, or intentionally minimized for emissions-control reasons.

In the hackathon framing, SeaPod acts as a last-line local detector on the ship itself. It detects nearby contacts, packages lightweight telemetry, and feeds HarborOS so the platform can compare that local detection against AIS and classify dark targets.

### What hardware is in the current SeaPod demo reference?
The current hardware reference centers on a Raspberry Pi 5 with a NEO-6M GPS over UART, a SparkFun LSM6DSO IMU over I2C, a Pi Camera, and an always-on CPU fan. The same reference also includes the expected GPIO map, UART baud rate, I2C address, and the debug commands the team can use to verify each component.

The demo notes add a dual-camera stereoscopic setup, described as a dual Arducam-style arrangement, to estimate range to a nearby target in the pool. That means the practical demo concept is broader than a single-camera Raspberry Pi, even though the backend only cares about the final payload.

### Why are two cameras used in the demo instead of LiDAR?
Current demo concept: the team uses dual cameras so the Pi can estimate range stereoscopically to a target such as a rubber duck. That keeps the sensing stack cheaper and simpler than adding LiDAR, while still demonstrating onboard depth estimation and passive detection.

This is also part of the strategic story of the product. The node is framed as a passive supplement to radar, so optical sensing is useful precisely because it does not need to emit additional RF energy to detect a nearby contact.

### What software is expected to run on the Pi?
The hardware reference calls out `pyserial` and `pynmea2` for GPS, `smbus2` for the IMU, `picamera2` for camera capture, `ultralytics` for YOLO object detection, and `requests` for posting detections back to HarborOS. The example flow is: read sensors, capture a frame, run detection, then send a JSON payload to the laptop.

That means the Pi is not just a dumb camera relay. Even in the current demo concept, it is doing real edge processing before HarborOS receives the event.

### How does the Pi communicate with HarborOS?
The current hardware reference uses HTTP POST with JSON to `http://<LAPTOP>.local:8000/api/edge-node/alert`, with the Pi discovering the laptop through mDNS rather than a hardcoded IP. The demo notes describe the same basic pattern over a local hotspot network.

Current implementation already supports this backend ingestion path. Once the payload arrives, the frontend picks it up on the next normal refresh cycle instead of needing a separate special-purpose socket just for SeaPod.

### What data does the node send to the backend?
The hardware reference shows a JSON payload with `node`, `target`, `lat`, `lon`, `distance_m`, `heading_deg`, `confidence`, and `stream_url`. Current implementation also accepts `velocity_ms`, stores `stream_url` in the anomaly details, and uses the other fields to compute target position and alert content.

The important design point is that HarborOS wants compact telemetry, not raw sensor dumps. The Pi can do local perception, then ship the small set of fields the backend needs for detection, scoring, and map display.

### How does HarborOS turn a pool demo into a maritime scenario?
Current demo concept: the raw GPS from Philadelphia is mathematically transposed to a more maritime-looking theater, and the short physical camera range in the pool is scaled up to represent nautical-mile distances. The same notes also describe simulating or hardcoding a bearing when a true heading source is not available.

Current implementation already applies a range-scaling constant in the backend and computes a target lat/lon from the node position, scaled distance, and heading. The checked-in code currently has GPS offsets set to `0.0`, so the repo as it stands still displays the node in the real Philadelphia region unless those offsets are changed.

### How does HarborOS know the detected object is a “dark ship”?
In the current implementation, the edge-node route creates an anomaly signal of type `dark_ship_optical` and uses the absence of a corresponding AIS identity as the basis for the dark-target explanation. The backend then creates or updates a separate “dark vessel” contact, writes its position, and runs that signal through the normal risk-scoring path.

This is important because SeaPod is not bypassing HarborOS’s scoring system. It is feeding HarborOS a new signal source that still goes through the same alert, explanation, and operator workflow as the rest of the platform.

### What are the main demo shortcuts or hardware limitations?
The hardware docs and demo notes are explicit that the current prototype is a hackathon build, not a full production package. The node is running in a pool, the target is a rubber duck, distances are scaled up, and some of the map output relies on demo transformations rather than true maritime geometry.

The biggest current sensor limitation is heading. The hardware reference includes an LSM6DSO IMU, but the broader notes point out that the prototype does not yet have a proper magnetometer-based absolute heading solution, so bearing may be simulated or hardcoded for the demo. Current implementation reflects that by randomizing heading when the payload does not provide one.

### Is HarborOS meant to stream raw video from the node in production?
Current demo concept: the local live camera stream is there to prove that the Pi is really running object detection on the edge and to give judges a “Captain’s POV” during the demo. It is a good hackathon demonstration tool, but it is not the core production data model.

The product notes are much closer to a low-bandwidth telemetry model than a video-streaming model. The durable idea is for the node to process frames locally and transmit only the relevant detection metrics unless an operator explicitly needs richer visual context.

### How does the hardware tie into the broader mesh-network idea?
Current concept notes describe SeaPod as one node in a larger “stitch network,” where participating ships or nodes contribute lightweight kinematic telemetry rather than full raw radar or video feeds. The mesh vision is to extend detection coverage by combining many local perspectives into a shared operational picture.

Current implementation supports single-node edge alert intake today, which is enough for the live hardware demo. Full multi-node mesh deduplication, trust management, and radar-blip fusion are still concept-stage items rather than finished code in this repository.

### How do teammates connect to and debug the Pi?
The hardware reference includes standard SSH setup and a set of practical verification commands for GPS, IMU, camera, CPU temperature, power throttling, and Wi-Fi. That makes the Pi workflow reproducible for teammates even if they were not the ones who wired the original node.

For hackathon work, those commands matter as much as the main payload flow. Hardware demos usually fail at the seams, so fast checks for GPS serial output, I2C detection, camera import, and thermal state are part of the actual operational workflow.

## Troubleshooting

### Why is the frontend not connecting to the backend?
The frontend expects the API at `http://localhost:8000/api` unless `NEXT_PUBLIC_API_URL` is set. If the backend is not running, CORS is misconfigured, or the frontend is pointed at the wrong API base, the dashboard will fail to load and show connection errors.

### Why are live AIS vessels not updating?
Current implementation only starts live AIS automatically when `AISSTREAM_API_KEY` is present. Without that key, HarborOS runs on seeded data only, and even with the key, updates still depend on the background ingestion loop, the AISStream connection, and the frontend’s 5-second polling refresh.

You can verify this through `/api/ingestion/status` and start ingestion manually through `/api/ingestion/start` if needed. Even with a healthy stream, “stale” UI data may simply mean the next polling cycle has not run yet.

### Why are weather or satellite details missing for some vessels?
NWS weather is a best-effort enrichment and only covers US territory and coastal waters, so offshore or non-US positions can legitimately return no weather object. Satellite data can also be absent if Copernicus is not configured, the request fails, or the search parameters do not match a recent acquisition.

That is expected behavior and should not block the rest of the platform. HarborOS treats weather and satellite details as enrichment layers, not as prerequisites for vessel scoring, alert display, or operator action handling.

### Why is the SeaPod marker in Philadelphia instead of the Atlantic?
Current demo notes describe GPS transposition as part of the theatrical “demo magic,” but the checked-in backend currently has `_GPS_LAT_OFFSET = 0.0` and `_GPS_LON_OFFSET = 0.0`. That means the live node remains at its real coordinates unless those offsets are explicitly changed.

This is a good example of the difference between current implementation and current demo concept. The pipeline supports transposition, but the default repo state leaves the GPS unshifted.

## Algorithm

### How is the risk score calculated, and what signals influence it most?
Current implementation first aggregates anomaly signals into a 0-1 severity using per-signal weights, then combines that with metadata deficiency and inspection risk through a fuzzy-logic engine that outputs a 0-100 score. The strongest weights are assigned to `dark_ship_optical`, `ais_gap`, `kinematic_implausibility`, `geofence_breach`, and `type_mismatch`, so those signals move the score more than routine maneuvering signals.

Repeated signals of the same type have diminishing returns, while multiple different signal types get a diversity bonus before normalization. That means HarborOS favors convergence of several suspicious behaviors over one weak rule firing repeatedly.

### How do you combine short-term behavior with long-term patterns?
Short-term behavior comes from recent position reports and is what most detectors use for immediate scoring. Long-term context comes from learned baselines built from archived Parquet data or SQLite fallback, plus regional statistics from recent fleet traffic; current implementation stores risk history for trend display, but that sparkline history is not yet fed back into the scorer.

The learned-baseline layer focuses on region- and vessel-type-specific speed, heading-change, and corridor patterns, while the live layer asks what the vessel is doing right now. Those two views meet during alert generation, where current behavior is evaluated against both immediate conditions and learned norms.

### How do you reduce false positives in dense traffic or bad weather?
The system reduces noise with vessel-type profiles, anchor exclusion for loitering, weather-aware threshold adjustments, and contextual collision logic. It also suppresses alerts when collision risk is the only active signal, so ordinary close-quarters traffic does not become a security alert by itself.

Examples in the current code include skipping loitering detection in low visibility, widening speed and heading thresholds in heavy weather, and reducing concern when a vessel is actively maneuvering in a COLREGS-compliant way. Those are pragmatic guardrails intended to keep the alert feed operationally useful instead of academically “sensitive.”

### How does the model handle missing AIS data or delayed telemetry?
Missing AIS is itself a feature in the model through `ais_gap` and `dark_vessel` detection, so silence can raise risk when it is suspicious. At the same time, missing or invalid fields such as AIS sentinel SOG and heading values are cleaned to `None`, and detectors that need those fields simply abstain instead of fabricating data.

At the ingestion layer, that cleaning happens before the records are stored, which prevents obviously bad raw values from propagating through the rest of the system. At the scoring layer, silence can be suspicious, but absence of one field is not automatically turned into synthetic evidence.

## Architecture

### What are the main system components, and how do they communicate?
The main components are a Next.js frontend, a FastAPI backend, a SQLite database, background ingestion and alert services, and adapter modules for external data sources. The frontend talks to the backend over REST, the backend writes normalized data to SQLite, and background tasks run ingestion and alert generation in-process.

In the repository, those responsibilities are split fairly cleanly across `frontend/app/components`, `frontend/app/lib`, `backend/app/api`, `backend/app/services`, `backend/app/data_sources`, and `backend/app/models`. That separation is what makes it possible to describe ingestion, detection, scoring, verification, and presentation as distinct stages rather than one monolithic app.

### How does data flow from ingestion to alert generation?
Live AIS messages are parsed by the AISStream adapter, batched by the ingestion service, and written into vessel and position tables. A background alert loop then runs anomaly detection and risk scoring, creates or updates alerts, and the frontend retrieves those results on its polling cycle.

The same basic pattern also applies to seeded demo traffic and edge-node alerts: they enter the same domain model and are surfaced through the same API layer. That keeps the operator experience consistent even when the underlying source changes.

### How do you ensure reliability if one data source is down?
Current implementation degrades gracefully rather than requiring every data source to be present. No AIS key means seeded mode, NWS failures return `None`, Sentinel tile failures redirect to Esri, and per-detector exceptions are contained so one bad signal does not take down the whole alert pass.

That same philosophy shows up in the frontend, which keeps retrying on connection loss and surfaces a toast instead of hard-failing the session. The system generally prefers returning less enrichment over pretending a failed provider succeeded.

## APIs and Data Sources

### Which external APIs are integrated today, and what role does each play?
Current implementation directly integrates AISStream.io for live AIS vessel data, the National Weather Service for weather enrichment, and Copernicus Data Space for Sentinel-2 catalog and imagery requests. It also uses Esri raster tiles as the imagery fallback; geofences and inspection-style enrichment in this repo are primarily seeded or curated rather than pulled from a live NOAA or USCG adapter.

That split is intentional for an MVP: live sources are used where they add operational realism, while seeded layers keep the demo reproducible and deterministic. It lets the team exercise the product workflow without pretending every external provider is already fully productionized.

### What internal APIs are exposed for frontend, alerts, and reporting?
The backend exposes routes for regions, vessels, vessel detail, risk history, alerts, alert audit, alert actions, detection metrics, analytics distribution, geofences, verification requests, scenario replay, ingestion control, archive stats, satellite operations, baselines, vessel profiles, and edge-node alerts. There is also a vessel report endpoint used for export-style reporting.

Most frontend screens are thin clients over these routes rather than duplicating logic in browser state. That keeps map, alert, detail, verification, and analytics behavior anchored to the same backend source of truth.

## Value and Impact

### What problem does this solve better than current maritime monitoring workflows?
HarborOS is designed to reduce the operator burden of staring at raw tracks and making every decision manually. It combines detection, triage, explanation, and recommended action in one loop, which is more actionable than a generic map or alert list alone.

The practical difference is that operators are not asked to mentally assemble risk from scattered widgets. The system compresses raw movement, anomaly context, and recommended response into one operational view.

### What decisions can users make faster because of this platform?
Operators can decide which contacts to ignore, monitor, verify, or escalate without first hand-parsing every track. They can also decide where to focus attention on the map, whether to review satellite context, and how to disposition an alert through acknowledgement, dismissal, notes, and feedback.

Because explanation, context, and action are presented together, the user spends less time switching between raw tracks, lists, and supporting detail. The value is not only in finding risk, but in shortening the path from detection to decision.

## Known Limitations

- Current implementation uses SQLite, in-process workers, and frontend polling, which are practical for an MVP but not a final large-scale deployment model.
- Only precision-oriented detection metrics are implemented today; recall, lead time, and richer alert-quality scoring are not yet computed.
- Weather enrichment is limited by NWS coverage, and satellite search requires Copernicus credentials for live Sentinel results.
- Verification workflows are satellite-first in the backend today, even though the broader product vision includes other asset types.
- The SeaPod hardware section mixes checked-in implementation with demo notes; a few elements, especially full mesh behavior and theatrical map transposition, are still concept-stage rather than complete software.
