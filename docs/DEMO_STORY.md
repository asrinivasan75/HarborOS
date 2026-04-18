# HarborOS — Demo Story

## The 2-Minute Demo Flow

### Setting
Port of San Pedro / Los Angeles Harbor — a busy commercial port with restricted zones, shipping lanes, and anchorage areas.

### Act 1: Situational Awareness (30 seconds)
Open HarborOS. The operator sees a dark-themed map of LA Harbor with:
- ~15 vessels shown as icons (cargo ships, tankers, tugs, small craft)
- Color-coded by risk level (green = normal, yellow = watch, red = alert)
- Geofence overlays showing restricted zones, shipping lanes, anchorage areas
- A sidebar alert feed showing 2-3 active alerts sorted by severity

**Narration**: "This is HarborOS — persistent maritime awareness for harbor defense. Every vessel in the operating area is tracked, scored, and triaged in real time."

### Act 2: Suspicious Contact (45 seconds)
Click on a red-flagged vessel — the MV DARK HORIZON, a small cargo vessel.

The detail panel shows:
- Vessel metadata: name, MMSI, type, flag state, dimensions
- Current course, speed, heading
- Position trail showing erratic movement
- **Risk Score: 87/100 — ESCALATE**
- Triggered anomaly signals:
  - Geofence breach: entered restricted zone near terminal
  - Loitering: stationary for 47 minutes in active shipping lane
  - Speed anomaly: alternating between 0 and 8 knots
  - AIS gap: 12-minute transmission gap during approach
- Human-readable explanation: "This vessel entered a restricted terminal zone, has been loitering with erratic speed changes, and had a suspicious AIS transmission gap during its approach."

**Narration**: "The system flagged this contact automatically. Every signal is explainable — the operator knows exactly what triggered the alert and why it matters."

### Act 3: Operator Action (30 seconds)
Show the recommended action: **ESCALATE**

Click "Request Verification" button. The system:
- Creates a verification task (shown in a task panel)
- Shows task state: "Queued → Assigned"
- Displays a placeholder: "Verification asset: Dockside Camera Node 3 — ETA: 4 min"

**Narration**: "The operator can escalate with one click. In production, this dispatches a verification asset — a camera, a patrol boat, or a drone. Today it's a software stub, but the integration surface is already built."

### Act 4: The Bigger Picture (15 seconds)
Return to the map view. Show the alert feed with all contacts triaged:
- 12 vessels: IGNORE (green)
- 2 vessels: MONITOR (yellow)
- 1 vessel: ESCALATE (red) — the one we just investigated

**Narration**: "HarborOS turns raw vessel data into operator decisions. Detect, assess, recommend, verify. That's the loop — and it works today with software alone."

## Key Demo Talking Points
- Every alert is explainable — no black box
- Risk scoring combines multiple signals, not just one threshold
- Verification is a first-class concept, not an afterthought
- The system works with seeded data today and real AIS feeds tomorrow
- Built for operators, not analysts — action-oriented, not report-oriented
