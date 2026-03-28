# SeaPod Edge Node Integration — Claude Chat Context

## What This Is
Copy everything below into a new Claude Code chat. It gives Claude full context on the HarborOS codebase and exactly what needs to be built to integrate the Raspberry Pi hardware demo.

---

## CONTEXT FOR NEW CHAT

You are working on HarborOS, a maritime threat detection platform. The GitHub repo is at https://github.com/asrinivasan75/HarborOS.

### Existing Architecture
- **Backend**: Python/FastAPI on port 8000, SQLite database, async AIS ingestion from AISStream.io WebSocket
- **Frontend**: Next.js/TypeScript/Tailwind/MapLibre GL on port 3000
- **Key backend files**:
  - `backend/app/main.py` — FastAPI app with lifespan, CORS, auto-starts AIS ingestion
  - `backend/app/api/routes.py` — all REST endpoints (vessels, alerts, geofences, verification, detection metrics, ingestion control, archive)
  - `backend/app/models/domain.py` — SQLAlchemy ORM models (VesselORM, PositionReportORM, AlertORM, GeofenceORM, etc.) + Pydantic schemas
  - `backend/app/services/anomaly_detection.py` — 11 heuristic detectors (geofence breach, loitering, speed anomaly, heading anomaly, AIS gap, zone lingering, kinematic implausibility, statistical outlier, collision risk, dark vessel)
  - `backend/app/services/risk_scoring.py` — composite risk scoring with configurable weights
  - `backend/app/services/alert_service.py` — alert generation, operator actions, audit trail
  - `backend/app/services/ingestion_service.py` — background AIS WebSocket ingestion + periodic alert scans
  - `backend/app/data_sources/aisstream_adapter.py` — AIS WebSocket client with 9 named regions
- **Key frontend files**:
  - `frontend/app/page.tsx` — main dashboard, state management, auto-refresh every 5s
  - `frontend/app/components/MapView.tsx` — MapLibre map with vessel markers (ship silhouettes), geofence overlays, vessel trails, satellite imagery toggle, heatmap layer, satellite footprint overlay
  - `frontend/app/components/VesselDetail.tsx` — vessel detail panel with risk score, anomaly signals, verification dispatch (camera/drone/patrol/satellite), alert actions, operator notes, satellite imagery preview
  - `frontend/app/components/AlertFeed.tsx` — alert list with search, sort, compare
  - `frontend/app/lib/api.ts` — API client with TypeScript types

### What the Backend Already Has
- Vessels are stored with: id, mmsi, name, vessel_type, flag_state, region, positions, etc.
- Alerts have: risk_score, recommended_action (ignore/monitor/verify/escalate), anomaly_signals, explanation, audit trail
- Verification requests support asset types: camera, drone, patrol_boat, satellite
- The frontend auto-refreshes vessels and alerts every 5 seconds
- WebSocket is used for AIS ingestion (backend side), but frontend uses REST polling

### What Needs to Be Built

You need to integrate a physical Raspberry Pi 5 "SeaPod" edge detection node. This is a floating hardware buoy in a pool that detects a rubber duck using computer vision and stereoscopic cameras.

#### Phase 1: Backend — Edge Node Ingestion Endpoint

Create `POST /api/edge-node/alert` in `routes.py` that:

1. Accepts this JSON payload from the Raspberry Pi:
```json
{
  "node": "SeaPod_Alpha",
  "target": "rubber_duck",
  "lat": 39.9526,
  "lon": -75.1652,
  "distance_m": 1.2,
  "heading_deg": 145,
  "confidence": 0.96,
  "stream_url": "http://PI_IP:8080/stream"
}
```

2. Applies "Demo Magic" transformations:
   - **GPS Transposition**: Offset raw Philly coordinates to the Atlantic Ocean (add offsets to lat/lon so the demo appears mid-ocean on the map)
   - **Range Scaling**: Multiply the 1.2m pool distance by ~6173 to get ~4 nautical miles
   - **Bearing Calculation**: Use the heading_deg and scaled distance to compute the target's lat/lon using great-circle math

3. Creates or updates a VesselORM record for the SeaPod node itself (the "ship") and a separate one for the detected dark vessel (the "duck"):
   - The SeaPod node: vessel_type="sensor_node", name="SeaPod Alpha", region="atlantic_demo"
   - The dark vessel: vessel_type="other", name="UNIDENTIFIED DARK VESSEL", flag_state="Unknown", region="atlantic_demo"

4. Creates position reports for both

5. Auto-generates an AlertORM with:
   - risk_score based on confidence (e.g., 0.96 * 100 = 96)
   - recommended_action = "escalate"
   - anomaly_type = "dark_ship_optical" (add this to the AnomalyType enum)
   - explanation = "Optical detection by SeaPod_Alpha: unregistered vessel at [lat, lon], range [X] nm, confidence [Y]%. No AIS transponder detected."

6. Stores the stream_url so the frontend can display it

#### Phase 2: Add "Atlantic Demo" Region

In `aisstream_adapter.py`, add a new region to the REGIONS dict:
```python
"atlantic_demo": {
    "name": "Atlantic Demo Zone",
    "bbox": [[15.0, -50.0], [25.0, -30.0]],
    "center": [20.0, -40.0],
    "zoom": 6,
    "description": "SeaPod hardware demo — transposed pool coordinates",
}
```

#### Phase 3: Frontend — SeaPod Visualization

In `MapView.tsx`:
- Add a new vessel icon type for "sensor_node" — a blue hexagon or buoy shape
- When a vessel has type "sensor_node" and there's a dark vessel alert, draw a **red dashed line** from the node to the target (line of sight indicator)
- The dark vessel should pulse red more aggressively than normal escalate vessels

In `VesselDetail.tsx`:
- When the selected vessel has a `stream_url`, show a live video embed:
```tsx
<div className="p-5 border-b border-[#1a2235]">
  <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Live Camera Feed</h3>
  <div className="rounded-lg overflow-hidden bg-black aspect-video">
    <img src={streamUrl} alt="Live feed" className="w-full h-full object-cover" />
  </div>
</div>
```
(MJPEG streams work with a simple `<img>` tag that auto-refreshes)

In `page.tsx`:
- Add a "SeaPod" indicator in the header or region summary that shows connection status

#### Phase 4: Receiver Server (Laptop Side)

Create `backend/harbor_server.py` — a simple Flask bridge that:
1. Runs on `0.0.0.0:5000`
2. Receives POST from the Pi at `/api/sensor`
3. Forwards the JSON to the FastAPI backend at `http://localhost:8000/api/edge-node/alert`
4. This is needed because the Pi sends to the Flask server over the hotspot, and Flask relays to FastAPI

Alternatively, if both Pi and laptop are on the same hotspot and FastAPI is accessible, the Pi can POST directly to FastAPI's `/api/edge-node/alert` — skip Flask entirely.

#### Phase 5: Pi Emitter Script

Create `hardware/pi_emitter.py`:
```python
import requests
import time

SERVER_URL = "http://LAPTOP_IP:8000/api/edge-node/alert"

while True:
    # In production: read from camera pipeline
    # For demo: send test payload
    payload = {
        "node": "SeaPod_Alpha",
        "target": "rubber_duck",
        "lat": 39.9526,  # GPS module feeds this
        "lon": -75.1652,
        "distance_m": 1.2,  # Stereoscopic calculation
        "heading_deg": 145,  # Hardcoded or from magnetometer
        "confidence": 0.96,  # CV model confidence
        "stream_url": "http://PI_IP:8080/stream"
    }

    try:
        response = requests.post(SERVER_URL, json=payload, timeout=2)
        print(f"Sent! Status: {response.status_code}")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(2)  # Send every 2 seconds
```

### Important Notes
- Don't modify the scoring algorithm — another team member owns that
- Don't add Co-Authored-By or mention AI in commits
- The `.env` file has `AISSTREAM_API_KEY` — don't commit it
- Use the same dark theme styling: `bg-[#0d1320]`, `bg-[#111827]`, `border-[#1a2235]`, `text-slate-300/400/500`
- The existing verification dispatch system (camera/drone/patrol/satellite) should work alongside the SeaPod — it's a different concept (SeaPod detects, verification assets verify)
- Keep the existing `harboros.db` schema — add columns with ALTER TABLE if needed, don't drop tables

### Demo Flow for Judges
1. Judge sees HarborOS dashboard with live AIS vessels worldwide
2. Switch to "Atlantic Demo Zone" region
3. SeaPod buoy appears as blue icon in the Atlantic
4. Red alert fires: "OPTICAL DARK SHIP DETECTION — SeaPod_Alpha"
5. Click alert — map flies to the Atlantic, shows red dashed line from buoy to dark vessel
6. Detail panel shows risk score 96, "No AIS transponder detected"
7. Live camera feed shows the rubber duck with CV bounding box
8. Operator clicks "Request Verification" to dispatch a drone
9. Narration: "This system just detected a vessel that doesn't exist in any AIS database, using only a $50 camera on a floating buoy. In production, this edge node costs under $200 and can be deployed on any ship, dock, or buoy."
