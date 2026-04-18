"""
Patch demo vessel alerts WITHOUT dropping any tables or data.

Safe to run on a live database — only touches the 3 demo vessels' alerts.
All live AIS data, vessels, and existing alerts remain untouched.

Run: cd backend && python -m app.patch_demo_alerts
"""

from __future__ import annotations
import json
import uuid

from app.database import SessionLocal
from app.models.domain import (
    AlertORM, AnomalySignalORM, RiskHistoryORM, VerificationRequestORM,
)

def patch():
    db = SessionLocal()
    try:
        # ── 1. MV DARK HORIZON — risk=100, 7 signals ─────────
        vid = "v-dark-horizon"
        # Clear old alerts + signals for this vessel
        for ea in db.query(AlertORM).filter(AlertORM.vessel_id == vid).all():
            db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == ea.id).delete()
            db.query(VerificationRequestORM).filter(VerificationRequestORM.alert_id == ea.id).delete()
            db.delete(ea)

        alert_id = str(uuid.uuid4())
        signals = [
            {
                "anomaly_type": "ais_gap",
                "severity": 0.88,
                "description": (
                    "Two AIS transmission gaps detected: 18 minutes (08:46\u201309:04 UTC) and "
                    "8 minutes (11:22\u201311:30 UTC). Vessel reappeared 2.1 nm from last known "
                    "position after first gap \u2014 inside APM Terminal Restricted Zone. "
                    "Gap duration and positional displacement exceed normal equipment failure patterns."
                ),
                "details": {
                    "gaps": [
                        {"start": "2026-03-27T08:46:00Z", "end": "2026-03-27T09:04:00Z", "duration_min": 18, "displacement_nm": 2.1},
                        {"start": "2026-03-27T11:22:00Z", "end": "2026-03-27T11:30:00Z", "duration_min": 8, "displacement_nm": 0.8},
                    ],
                    "total_gaps": 2,
                    "max_gap_min": 18,
                    "intentional_confidence": "high",
                },
            },
            {
                "anomaly_type": "geofence_breach",
                "severity": 0.92,
                "description": (
                    "Vessel entered APM Terminal Restricted Zone at 09:04 UTC "
                    "and remained inside for approximately 50 minutes with loitering behavior. "
                    "No port authority clearance on file. Additionally approached within 0.3 nm of "
                    "LNG Terminal Security Zone perimeter at 10:18 UTC."
                ),
                "details": {
                    "breached_zones": [
                        {"zone_id": "gf-restricted-terminal", "zone_name": "APM Terminal Restricted Zone", "severity": "high", "duration_min": 50},
                        {"zone_id": "gf-security-zone-lng", "zone_name": "LNG Terminal Security Zone", "severity": "high", "approach_nm": 0.3},
                    ],
                    "clearance_verified": False,
                },
            },
            {
                "anomaly_type": "loitering",
                "severity": 0.70,
                "description": (
                    "Loitering detected in restricted terminal zone: 25 position reports "
                    "over 50 minutes within a 0.4 nm radius. Speed oscillated between 0\u20138 kt with "
                    "no consistent heading \u2014 inconsistent with cargo operations or anchorage waiting."
                ),
                "details": {
                    "duration_min": 50, "radius_nm": 0.4, "position_count": 25,
                    "avg_speed_kt": 2.3, "speed_variance": 6.8, "heading_variance_deg": 142,
                },
            },
            {
                "anomaly_type": "route_deviation",
                "severity": 0.55,
                "description": (
                    "Vessel declared destination 'UNKNOWN' with no filed voyage plan. Track shows "
                    "low correlation with standard LA Harbor approach routes. Course changed >90\u00b0 "
                    "on 4 occasions."
                ),
                "details": {
                    "declared_destination": "UNKNOWN", "voyage_plan_filed": False,
                    "course_changes_over_90deg": 4, "route_correlation_pct": 18,
                },
            },
            {
                "anomaly_type": "type_mismatch",
                "severity": 0.85,
                "description": (
                    "Multiple identity red flags: IMO number missing (required for cargo vessels "
                    ">300 GT), callsign not registered, flag state (Marshall Islands) on enhanced "
                    "monitoring list. 4 inspection deficiencies from last PSC inspection (Jun 2025). "
                    "MMSI 538006789 has no prior port calls in USCG database."
                ),
                "details": {
                    "missing_imo": True, "missing_callsign": True,
                    "flag_state_risk": "elevated", "inspection_deficiencies": 4,
                    "prior_port_calls": 0,
                },
            },
            {
                "anomaly_type": "zone_lingering",
                "severity": 0.78,
                "description": (
                    "Vessel lingered within 0.3 nm of LNG Terminal Security Zone for 50 minutes. "
                    "Repeated slow passes along the perimeter suggest deliberate reconnaissance. "
                    "Speed dropped to 0 kt on 4 occasions while oriented toward the terminal."
                ),
                "details": {
                    "zone_id": "gf-security-zone-lng", "zone_name": "LNG Terminal Security Zone",
                    "linger_duration_min": 50, "min_distance_nm": 0.3,
                    "dead_stops": 4, "perimeter_passes": 6,
                },
            },
            {
                "anomaly_type": "speed_anomaly",
                "severity": 0.62,
                "description": (
                    "Abnormal speed profile: vessel accelerated to 14+ kt in restricted harbor zone "
                    "(speed limit 8 kt) during sprint toward LNG terminal, then decelerated to "
                    "near-zero within 3 minutes. Speed variance across track is 6.8 kt \u2014 "
                    "3.2x the regional average for cargo vessels."
                ),
                "details": {
                    "max_speed_kt": 15.2, "zone_speed_limit_kt": 8,
                    "speed_variance_kt": 6.8, "regional_avg_variance_kt": 2.1,
                    "rapid_decel_events": 3,
                },
            },
        ]

        alert = AlertORM(
            id=alert_id,
            vessel_id=vid,
            risk_score=100.0,
            recommended_action="escalate",
            explanation=(
                "MV DARK HORIZON exhibits 7 anomaly signals across identity, spatial, and behavioral "
                "dimensions. Vessel went dark twice before appearing inside APM Terminal Restricted Zone "
                "with sustained loitering. Sprinted at 14+ kt toward LNG terminal then lingered along "
                "its perimeter. No IMO, no callsign, no voyage plan, Marshall Islands flag. "
                "Recommend immediate USCG verification and potential boarding."
            ),
            anomaly_signals_json=json.dumps(signals),
        )
        db.add(alert)
        for sig in signals:
            db.add(AnomalySignalORM(
                alert_id=alert_id, anomaly_type=sig["anomaly_type"],
                severity=sig["severity"], description=sig["description"],
                details_json=json.dumps(sig["details"]),
            ))
        print(f"  {vid}: risk=100, ESCALATE, 7 signals")

        # ── 2. JADE STAR — risk=72, spoofing ─────────────────
        vid = "v-jade-star"
        for ea in db.query(AlertORM).filter(AlertORM.vessel_id == vid).all():
            db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == ea.id).delete()
            db.delete(ea)

        alert_id = str(uuid.uuid4())
        signals = [{
            "anomaly_type": "kinematic_implausibility",
            "severity": 0.55,
            "description": (
                "2 impossible position jumps detected (max 50.0 nm in under 2 minutes). "
                "Vessel appeared to teleport between locations \u2014 strong indicator of "
                "AIS position spoofing or GPS manipulation."
            ),
            "details": {
                "impossible_jumps": 2, "max_jump_nm": 50.0,
                "max_implied_speed_kt": 1500.0, "spoofing_confidence": "high",
            },
        }]
        alert = AlertORM(
            id=alert_id, vessel_id=vid, risk_score=72.0,
            recommended_action="verify",
            explanation=(
                "AIS position data shows kinematic implausibility \u2014 "
                "2 position jumps exceeding physically possible vessel speed. "
                "Probable AIS spoofing or GPS manipulation. Verify actual position."
            ),
            anomaly_signals_json=json.dumps(signals),
        )
        db.add(alert)
        for sig in signals:
            db.add(AnomalySignalORM(
                alert_id=alert_id, anomaly_type=sig["anomaly_type"],
                severity=sig["severity"], description=sig["description"],
                details_json=json.dumps(sig["details"]),
            ))
        print(f"  {vid}: risk=72, VERIFY, 1 signal")

        # ── 3. DARK OPTICAL — risk=85, CV detection ──────────
        vid = "v-dark-optical-1"
        for ea in db.query(AlertORM).filter(AlertORM.vessel_id == vid).all():
            db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == ea.id).delete()
            db.delete(ea)

        alert_id = str(uuid.uuid4())
        signals = [{
            "anomaly_type": "dark_ship_optical",
            "severity": 0.65,
            "description": (
                "OPTICAL DARK SHIP DETECTION by SeaPod_Alpha. "
                "Unregistered vessel detected at range 3.3 nm, bearing 295\u00b0. "
                "No AIS transponder signal. Detection confidence: 50%. "
                "This vessel does not appear in any AIS database."
            ),
            "details": {
                "source": "edge_node", "node_id": "SeaPod_Alpha",
                "raw_distance_m": 6112.0, "scaled_distance_nm": 3.3,
                "velocity_ms": 4.2, "heading_deg": 295,
                "confidence": 0.50, "stream_url": None,
            },
        }]
        alert = AlertORM(
            id=alert_id, vessel_id=vid, risk_score=85.0,
            recommended_action="escalate",
            explanation=(
                "Unidentified vessel detected by optical computer vision (SeaPod edge node). "
                "No AIS transponder, no registered identity. "
                "Detected at 3.3 nm range, bearing 295\u00b0, moving at ~4.2 kt."
            ),
            anomaly_signals_json=json.dumps(signals),
        )
        db.add(alert)
        for sig in signals:
            db.add(AnomalySignalORM(
                alert_id=alert_id, anomaly_type=sig["anomaly_type"],
                severity=sig["severity"], description=sig["description"],
                details_json=json.dumps(sig["details"]),
            ))
        print(f"  {vid}: risk=85, ESCALATE, 1 signal")

        db.commit()
        print("\nDone. Live AIS data untouched.")

    finally:
        db.close()


if __name__ == "__main__":
    patch()
