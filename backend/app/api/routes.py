"""FastAPI route handlers."""

from __future__ import annotations
from datetime import datetime
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.domain import (
    VesselORM, PositionReportORM, GeofenceORM, AlertORM, VerificationRequestORM, AlertAuditORM,
    VesselSchema, VesselDetailSchema, GeofenceSchema, AlertSchema, AlertAuditSchema,
    AlertActionRequest, DetectionMetricsSchema,
    VerificationRequestSchema, VerificationRequestCreate,
    RiskAssessmentSchema, AnomalySignalSchema, PositionReportSchema,
)
from app.services.anomaly_detection import run_anomaly_detection
from app.services.risk_scoring import compute_risk_assessment
from app.services.alert_service import get_alerts, update_alert_status, generate_alerts_for_all_vessels

router = APIRouter()


# ── Regions ────────────────────────────────────────────

@router.get("/regions")
def list_regions():
    """List all available monitoring regions with metadata."""
    from app.data_sources.aisstream_adapter import REGIONS
    return {
        key: {
            "name": r["name"],
            "center": r["center"],
            "zoom": r["zoom"],
            "description": r["description"],
            "bbox": r["bbox"],
        }
        for key, r in REGIONS.items()
    }


# ── Vessels ────────────────────────────────────────────

@router.get("/vessels")
def list_vessels(
    region: str | None = Query(None, description="Filter by region key"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List vessels with latest position and risk info (paginated)."""
    base_query = db.query(VesselORM)
    if region:
        base_query = base_query.filter(VesselORM.region == region)
    total = base_query.count()

    latest_pos_sq = (
        db.query(
            PositionReportORM.vessel_id,
            func.max(PositionReportORM.timestamp).label("max_ts"),
        )
        .group_by(PositionReportORM.vessel_id)
        .subquery()
    )

    rows = (
        db.query(VesselORM, PositionReportORM, AlertORM)
        .outerjoin(latest_pos_sq, VesselORM.id == latest_pos_sq.c.vessel_id)
        .outerjoin(
            PositionReportORM,
            (PositionReportORM.vessel_id == latest_pos_sq.c.vessel_id)
            & (PositionReportORM.timestamp == latest_pos_sq.c.max_ts),
        )
        .outerjoin(
            AlertORM,
            (AlertORM.vessel_id == VesselORM.id) & (AlertORM.status == "active"),
        )
    )
    if region:
        rows = rows.filter(VesselORM.region == region)
    rows = rows.limit(limit).offset(offset).all()

    items = []
    for v, pos, alert in rows:
        items.append(VesselSchema(
            id=v.id,
            mmsi=v.mmsi,
            name=v.name,
            vessel_type=v.vessel_type,
            flag_state=v.flag_state,
            length=v.length,
            beam=v.beam,
            draft=v.draft,
            imo=v.imo,
            callsign=v.callsign,
            destination=v.destination,
            region=v.region,
            latest_position=PositionReportSchema(
                timestamp=pos.timestamp,
                latitude=pos.latitude,
                longitude=pos.longitude,
                speed_over_ground=pos.speed_over_ground,
                course_over_ground=pos.course_over_ground,
                heading=pos.heading,
            ) if pos else None,
            risk_score=alert.risk_score if alert else 0,
            recommended_action=alert.recommended_action if alert else "ignore",
        ))
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/vessels/{vessel_id}", response_model=VesselDetailSchema)
def get_vessel_detail(vessel_id: str, db: Session = Depends(get_db)):
    """Get detailed vessel info with position trail and anomaly signals."""
    vessel = db.query(VesselORM).filter(VesselORM.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")

    positions = (
        db.query(PositionReportORM)
        .filter(PositionReportORM.vessel_id == vessel_id)
        .order_by(PositionReportORM.timestamp.desc())
        .limit(200)
        .all()
    )[::-1]

    alert = (
        db.query(AlertORM)
        .filter(AlertORM.vessel_id == vessel_id, AlertORM.status == "active")
        .first()
    )

    signals = []
    explanation = None
    risk_score = 0.0
    recommended_action = "ignore"

    if alert:
        risk_score = alert.risk_score
        recommended_action = alert.recommended_action
        explanation = alert.explanation
        if alert.anomaly_signals_json:
            signals = [AnomalySignalSchema(**s) for s in json.loads(alert.anomaly_signals_json)]

    return VesselDetailSchema(
        id=vessel.id,
        mmsi=vessel.mmsi,
        name=vessel.name,
        vessel_type=vessel.vessel_type,
        flag_state=vessel.flag_state,
        length=vessel.length,
        beam=vessel.beam,
        draft=vessel.draft,
        imo=vessel.imo,
        callsign=vessel.callsign,
        destination=vessel.destination,
        inspection_deficiencies=vessel.inspection_deficiencies or 0,
        last_inspection_date=vessel.last_inspection_date,
        latest_position=PositionReportSchema(
            timestamp=positions[-1].timestamp,
            latitude=positions[-1].latitude,
            longitude=positions[-1].longitude,
            speed_over_ground=positions[-1].speed_over_ground,
            course_over_ground=positions[-1].course_over_ground,
            heading=positions[-1].heading,
        ) if positions else None,
        risk_score=risk_score,
        recommended_action=recommended_action,
        positions=[PositionReportSchema(
            timestamp=p.timestamp,
            latitude=p.latitude,
            longitude=p.longitude,
            speed_over_ground=p.speed_over_ground,
            course_over_ground=p.course_over_ground,
            heading=p.heading,
        ) for p in positions],
        anomaly_signals=signals,
        explanation=explanation,
    )


# ── Risk Assessment ────────────────────────────────────

@router.get("/vessels/{vessel_id}/report")
def get_vessel_report(vessel_id: str, db: Session = Depends(get_db)):
    """Generate a comprehensive incident report for a vessel."""
    vessel = db.query(VesselORM).filter(VesselORM.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")

    # Latest position
    positions = (
        db.query(PositionReportORM)
        .filter(PositionReportORM.vessel_id == vessel_id)
        .order_by(PositionReportORM.timestamp.desc())
        .limit(50)
        .all()
    )
    latest_position = None
    if positions:
        p = positions[0]
        latest_position = {
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "speed_over_ground": p.speed_over_ground,
            "course_over_ground": p.course_over_ground,
            "heading": p.heading,
        }

    # Position trail (chronological order, last 50)
    position_trail = [
        {
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "speed_over_ground": p.speed_over_ground,
            "course_over_ground": p.course_over_ground,
            "heading": p.heading,
        }
        for p in reversed(positions)
    ]

    # Risk assessment and anomaly signals from active alert
    alert = (
        db.query(AlertORM)
        .filter(AlertORM.vessel_id == vessel_id, AlertORM.status == "active")
        .first()
    )
    risk_assessment = {
        "score": alert.risk_score if alert else 0,
        "recommended_action": alert.recommended_action if alert else "ignore",
        "explanation": alert.explanation if alert else None,
    }
    anomaly_signals = []
    if alert and alert.anomaly_signals_json:
        anomaly_signals = json.loads(alert.anomaly_signals_json)

    # Operator notes
    operator_notes = alert.operator_notes if alert else None

    # Alert audit trail
    alert_audit_trail = []
    if alert:
        audit_entries = (
            db.query(AlertAuditORM)
            .filter(AlertAuditORM.alert_id == alert.id)
            .order_by(AlertAuditORM.timestamp.desc())
            .all()
        )
        alert_audit_trail = [
            {
                "action": e.action,
                "details": e.details,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            }
            for e in audit_entries
        ]

    # Verification requests
    verification_requests = []
    vrs = (
        db.query(VerificationRequestORM)
        .filter(VerificationRequestORM.vessel_id == vessel_id)
        .order_by(VerificationRequestORM.created_at.desc())
        .all()
    )
    for vr in vrs:
        verification_requests.append({
            "id": vr.id,
            "status": vr.status,
            "asset_type": vr.asset_type,
            "asset_id": vr.asset_id,
            "created_at": vr.created_at.isoformat() if vr.created_at else None,
            "updated_at": vr.updated_at.isoformat() if vr.updated_at else None,
            "result_confidence": vr.result_confidence,
            "result_notes": vr.result_notes,
            "result_media_ref": vr.result_media_ref,
        })

    return {
        "vessel": {
            "id": vessel.id,
            "name": vessel.name,
            "mmsi": vessel.mmsi,
            "imo": vessel.imo,
            "vessel_type": vessel.vessel_type,
            "flag_state": vessel.flag_state,
            "length": vessel.length,
            "beam": vessel.beam,
            "draft": vessel.draft,
        },
        "latest_position": latest_position,
        "risk_assessment": risk_assessment,
        "anomaly_signals": anomaly_signals,
        "position_trail": position_trail,
        "alert_audit_trail": alert_audit_trail,
        "operator_notes": operator_notes,
        "verification_requests": verification_requests,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/vessels/{vessel_id}/risk", response_model=RiskAssessmentSchema)
def get_vessel_risk(vessel_id: str, db: Session = Depends(get_db)):
    """Compute fresh risk assessment for a vessel."""
    vessel = db.query(VesselORM).filter(VesselORM.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")

    positions = (
        db.query(PositionReportORM)
        .filter(PositionReportORM.vessel_id == vessel_id)
        .order_by(PositionReportORM.timestamp)
        .all()
    )
    geofences = db.query(GeofenceORM).all()

    signals = run_anomaly_detection(vessel, positions, geofences)
    assessment = compute_risk_assessment(vessel, signals)
    return assessment


# ── Alerts ─────────────────────────────────────────────

@router.get("/alerts")
def list_alerts(
    status: str | None = Query(None, description="Filter by status"),
    region: str | None = Query(None, description="Filter by region key"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List alerts sorted by severity (paginated)."""
    alerts, total = get_alerts(db, status=status, region=region, limit=limit, offset=offset)
    return {"items": alerts, "total": total, "limit": limit, "offset": offset}


@router.get("/alerts/{alert_id}", response_model=AlertSchema)
def get_alert_detail(alert_id: str, db: Session = Depends(get_db)):
    """Get single alert detail."""
    alert = db.query(AlertORM).filter(AlertORM.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    signals = json.loads(alert.anomaly_signals_json) if alert.anomaly_signals_json else []
    return AlertSchema(
        id=alert.id,
        vessel_id=alert.vessel_id,
        vessel_name=alert.vessel.name if alert.vessel else None,
        vessel_mmsi=alert.vessel.mmsi if alert.vessel else None,
        created_at=alert.created_at,
        status=alert.status,
        risk_score=alert.risk_score,
        recommended_action=alert.recommended_action,
        explanation=alert.explanation,
        anomaly_signals=[AnomalySignalSchema(**s) for s in signals],
    )


@router.post("/alerts/{alert_id}/action")
def alert_action(
    alert_id: str,
    req: AlertActionRequest,
    db: Session = Depends(get_db),
):
    """Perform an operator action on an alert (acknowledge, dismiss, pin, note, feedback)."""
    alert = db.query(AlertORM).filter(AlertORM.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    action = req.action
    if action in ("acknowledge", "acknowledged"):
        alert.status = "acknowledged"
    elif action in ("dismiss", "dismissed"):
        alert.status = "dismissed"
    elif action in ("pin", "pinned"):
        alert.status = "pinned"

    if req.notes:
        alert.operator_notes = req.notes

    if req.feedback and req.feedback in ("confirmed", "false_positive"):
        alert.feedback = req.feedback
        alert.feedback_at = datetime.utcnow()

    # Create audit entry
    audit = AlertAuditORM(
        alert_id=alert_id,
        action=action,
        details=json.dumps({
            "notes": req.notes,
            "feedback": req.feedback,
            "new_status": alert.status,
        }),
    )
    db.add(audit)
    db.commit()

    return {"id": alert.id, "status": alert.status, "feedback": alert.feedback}


# Keep legacy PATCH for backward compatibility
@router.patch("/alerts/{alert_id}")
def patch_alert(
    alert_id: str,
    status: str = Query(...),
    notes: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Update alert status (legacy endpoint)."""
    alert = update_alert_status(db, alert_id, status, notes)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"id": alert.id, "status": alert.status}


@router.get("/alerts/{alert_id}/audit", response_model=list[AlertAuditSchema])
def get_alert_audit(alert_id: str, db: Session = Depends(get_db)):
    """Get the audit trail for an alert."""
    entries = (
        db.query(AlertAuditORM)
        .filter(AlertAuditORM.alert_id == alert_id)
        .order_by(AlertAuditORM.timestamp.desc())
        .all()
    )
    return [AlertAuditSchema(action=e.action, details=e.details, timestamp=e.timestamp) for e in entries]


@router.get("/detection/metrics", response_model=DetectionMetricsSchema)
def get_detection_metrics(
    region: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Get detection quality metrics — precision, false positive rate, etc."""
    def q():
        base = db.query(AlertORM)
        if region:
            base = base.join(VesselORM).filter(VesselORM.region == region)
        return base

    total = q().count()
    active = q().filter(AlertORM.status == "active").count()
    acknowledged = q().filter(AlertORM.status == "acknowledged").count()
    dismissed = q().filter(AlertORM.status == "dismissed").count()
    confirmed = q().filter(AlertORM.feedback == "confirmed").count()
    false_pos = q().filter(AlertORM.feedback == "false_positive").count()
    feedback_total = confirmed + false_pos

    return DetectionMetricsSchema(
        total_alerts=total,
        active_alerts=active,
        acknowledged=acknowledged,
        dismissed=dismissed,
        confirmed_threats=confirmed,
        false_positives=false_pos,
        pending_feedback=total - feedback_total - dismissed,
        precision=round(confirmed / feedback_total, 3) if feedback_total > 0 else None,
    )


@router.post("/alerts/generate")
def trigger_alert_generation(db: Session = Depends(get_db)):
    """Manually trigger anomaly detection and alert generation for all vessels."""
    alerts = generate_alerts_for_all_vessels(db)
    return {"alerts_created": len(alerts)}


# ── Geofences ──────────────────────────────────────────

@router.get("/geofences", response_model=list[GeofenceSchema])
def list_geofences(db: Session = Depends(get_db)):
    """List all geofence zones."""
    geofences = db.query(GeofenceORM).all()
    return [
        GeofenceSchema(
            id=gf.id,
            name=gf.name,
            zone_type=gf.zone_type,
            geometry=json.loads(gf.geometry_json),
            severity=gf.severity,
            description=gf.description,
        )
        for gf in geofences
    ]


# ── Verification Requests ─────────────────────────────

@router.post("/verification-requests", response_model=VerificationRequestSchema)
def create_verification_request(
    req: VerificationRequestCreate,
    db: Session = Depends(get_db),
):
    """Create a mocked verification request (future hardware integration point)."""
    # Simulated asset assignment
    asset_registry = {
        "camera": {"asset_id": "DCAM-NODE-3", "name": "Dockside Camera Node 3", "eta_min": 4},
        "patrol_boat": {"asset_id": "PB-07", "name": "Harbor Patrol 07", "eta_min": 12},
        "drone": {"asset_id": "UAV-12", "name": "Surveillance Drone 12", "eta_min": 8},
        "satellite": {"asset_id": "SENTINEL-2A", "name": "Sentinel-2A (ESA)", "eta_min": 47},
    }
    asset = asset_registry.get(req.asset_type, asset_registry["camera"])

    is_satellite = (req.asset_type == "satellite")
    now = datetime.utcnow()

    # For satellite: immediately return last-pass imagery data
    last_pass_notes = None
    last_pass_confidence = None
    last_pass_media = None
    if is_satellite:
        import random
        days_ago = random.randint(1, 4)
        cloud_cover = random.randint(5, 35)
        last_pass_notes = json.dumps({
            "last_pass": {
                "acquired": (now - __import__("datetime").timedelta(days=days_ago)).isoformat() + "Z",
                "satellite": "Sentinel-2A",
                "resolution_m": 10,
                "cloud_cover_pct": cloud_cover,
                "bands": "True Color (B4/B3/B2)",
                "status": "delivered",
            },
            "next_pass": {
                "eta_minutes": asset["eta_min"],
                "satellite": "Sentinel-2B",
                "expected_resolution_m": 10,
                "status": "tasking_accepted",
            },
        })
        last_pass_confidence = round(0.7 - (cloud_cover / 100) * 0.3, 2)
        last_pass_media = f"s2_tile_{now.strftime('%Y%m%d')}_{days_ago}d_ago.tif"

    verification = VerificationRequestORM(
        id=str(uuid.uuid4()),
        alert_id=req.alert_id,
        vessel_id=req.vessel_id,
        status="in_progress" if is_satellite else "assigned",
        asset_type=req.asset_type or "camera",
        asset_id=asset["asset_id"],
        created_at=now,
        updated_at=now,
        result_confidence=last_pass_confidence,
        result_notes=last_pass_notes,
        result_media_ref=last_pass_media,
    )
    db.add(verification)
    db.commit()
    db.refresh(verification)

    return VerificationRequestSchema(
        id=verification.id,
        alert_id=verification.alert_id,
        vessel_id=verification.vessel_id,
        status=verification.status,
        asset_type=verification.asset_type,
        asset_id=verification.asset_id,
        created_at=verification.created_at,
        updated_at=verification.updated_at,
        result_confidence=verification.result_confidence,
        result_notes=verification.result_notes,
        result_media_ref=verification.result_media_ref,
    )


@router.get("/verification-requests/{request_id}", response_model=VerificationRequestSchema)
def get_verification_request(request_id: str, db: Session = Depends(get_db)):
    """Get verification request status.

    For satellite requests, simulates the next pass completing after ~20 seconds
    (compressed from ~47 minutes for demo purposes).
    """
    vr = db.query(VerificationRequestORM).filter(VerificationRequestORM.id == request_id).first()
    if not vr:
        raise HTTPException(status_code=404, detail="Verification request not found")

    # Simulate satellite next-pass completion (20s after creation for demo)
    if vr.asset_type == "satellite" and vr.status == "in_progress":
        elapsed = (datetime.utcnow() - vr.created_at).total_seconds()
        if elapsed > 20:
            import random
            cloud_cover = random.randint(2, 15)
            # Parse existing notes and update with new pass data
            existing = json.loads(vr.result_notes) if vr.result_notes else {}
            existing["next_pass"] = {
                "acquired": datetime.utcnow().isoformat() + "Z",
                "satellite": "Sentinel-2B",
                "resolution_m": 10,
                "cloud_cover_pct": cloud_cover,
                "bands": "True Color (B4/B3/B2)",
                "status": "delivered",
            }
            vr.status = "completed"
            vr.result_notes = json.dumps(existing)
            vr.result_confidence = round(0.85 - (cloud_cover / 100) * 0.2, 2)
            vr.result_media_ref = f"s2_tile_{datetime.utcnow().strftime('%Y%m%d')}_fresh.tif"
            vr.updated_at = datetime.utcnow()
            db.commit()

    return VerificationRequestSchema(
        id=vr.id,
        alert_id=vr.alert_id,
        vessel_id=vr.vessel_id,
        status=vr.status,
        asset_type=vr.asset_type,
        asset_id=vr.asset_id,
        created_at=vr.created_at,
        updated_at=vr.updated_at,
        result_confidence=vr.result_confidence,
        result_notes=vr.result_notes,
        result_media_ref=vr.result_media_ref,
    )


# ── Scenario / Demo ───────────────────────────────────

@router.get("/scenario/timeline")
def get_scenario_timeline(db: Session = Depends(get_db)):
    """Get time range of position data for scenario replay controls."""
    from sqlalchemy import func
    result = db.query(
        func.min(PositionReportORM.timestamp),
        func.max(PositionReportORM.timestamp),
    ).first()
    if not result or not result[0]:
        return {"start": None, "end": None, "total_reports": 0}

    total = db.query(PositionReportORM).count()
    return {
        "start": result[0].isoformat(),
        "end": result[1].isoformat(),
        "total_reports": total,
    }


@router.get("/vessels/positions/at-time")
def get_positions_at_time(
    timestamp: str = Query(..., description="ISO timestamp"),
    db: Session = Depends(get_db),
):
    """Get all vessel positions at or before a given time (for replay)."""
    from sqlalchemy import func
    target = datetime.fromisoformat(timestamp)

    # Get latest position for each vessel before target time
    subq = (
        db.query(
            PositionReportORM.vessel_id,
            func.max(PositionReportORM.timestamp).label("max_ts"),
        )
        .filter(PositionReportORM.timestamp <= target)
        .group_by(PositionReportORM.vessel_id)
        .subquery()
    )

    positions = (
        db.query(PositionReportORM)
        .join(subq, (
            (PositionReportORM.vessel_id == subq.c.vessel_id) &
            (PositionReportORM.timestamp == subq.c.max_ts)
        ))
        .all()
    )

    result = []
    for p in positions:
        vessel = db.query(VesselORM).filter(VesselORM.id == p.vessel_id).first()
        alert = (
            db.query(AlertORM)
            .filter(AlertORM.vessel_id == p.vessel_id, AlertORM.status == "active")
            .first()
        )
        result.append({
            "vessel_id": p.vessel_id,
            "vessel_name": vessel.name if vessel else None,
            "vessel_type": vessel.vessel_type if vessel else None,
            "mmsi": vessel.mmsi if vessel else None,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "speed_over_ground": p.speed_over_ground,
            "course_over_ground": p.course_over_ground,
            "heading": p.heading,
            "timestamp": p.timestamp.isoformat(),
            "risk_score": alert.risk_score if alert else 0,
            "recommended_action": alert.recommended_action if alert else "ignore",
        })

    return result


# ── Live Ingestion Control ─────────────────────────────

@router.get("/ingestion/status")
def ingestion_status():
    """Get the status of the live AIS ingestion service."""
    from app.services.ingestion_service import get_ingestion_service
    service = get_ingestion_service()
    return service.status


@router.post("/ingestion/start")
async def start_ingestion(
    api_key: str | None = Query(None, description="AISStream API key (or set AISSTREAM_API_KEY env var)"),
):
    """Start live AIS data ingestion from AISStream.io."""
    import os
    from app.services.ingestion_service import create_ingestion_service

    key = api_key or os.environ.get("AISSTREAM_API_KEY", "")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="No API key provided. Pass api_key param or set AISSTREAM_API_KEY env var.",
        )

    service = create_ingestion_service(api_key=key)
    await service.start()
    return {"status": "started", "message": "Live AIS ingestion started"}


@router.post("/ingestion/stop")
async def stop_ingestion():
    """Stop live AIS data ingestion."""
    from app.services.ingestion_service import get_ingestion_service
    service = get_ingestion_service()
    await service.stop()
    return {"status": "stopped", "message": "Live AIS ingestion stopped"}


# ── Data Archive ───────────────────────────────────────

@router.get("/archive/stats")
def archive_stats():
    """Get stats on archived position data (Parquet files)."""
    from app.services.archive_service import get_archive_stats
    return get_archive_stats()


# ── Satellite Imagery ──────────────────────────────────

@router.get("/satellite/info")
def satellite_info():
    """Get Sentinel-2 satellite constellation info and tile URLs."""
    from app.data_sources.sentinel_adapter import get_sentinel2_tile_url, get_sentinel2_info
    return {
        "tiles": get_sentinel2_tile_url(),
        "constellation": get_sentinel2_info(),
    }


@router.post("/archive/run")
def run_archive(
    retention_minutes: int = Query(30, description="Keep this many minutes in SQLite"),
    db: Session = Depends(get_db),
):
    """Manually trigger archival of old position data to Parquet."""
    from app.services.archive_service import archive_old_positions
    return archive_old_positions(retention_minutes=retention_minutes, db=db)


# ── Learned Baselines ────────────────────────────────

@router.get("/baselines")
def get_baselines():
    """View learned behavioral baselines (per-region, per-vessel-type stats)."""
    from app.services.pattern_learning import get_learned_baseline
    baseline = get_learned_baseline()
    return baseline.summary()


@router.post("/baselines/refresh")
def refresh_baselines(db: Session = Depends(get_db)):
    """Force refresh learned baselines from Parquet archives + SQLite."""
    from app.services.pattern_learning import refresh_baseline
    baseline = refresh_baseline(db)
    return baseline.summary()


# ── Vessel Profiles ──────────────────────────────────

@router.get("/vessel-profiles")
def get_vessel_profiles():
    """View vessel type behavior profiles used by anomaly detection."""
    from app.services.vessel_profiles import VESSEL_PROFILES, _DEFAULT_PROFILE
    return {
        "profiles": VESSEL_PROFILES,
        "default": _DEFAULT_PROFILE,
    }
