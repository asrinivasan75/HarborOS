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
    VesselORM, PositionReportORM, GeofenceORM, AlertORM, VerificationRequestORM,
    VesselSchema, VesselDetailSchema, GeofenceSchema, AlertSchema,
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


@router.patch("/alerts/{alert_id}")
def patch_alert(
    alert_id: str,
    status: str = Query(...),
    notes: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Update alert status (acknowledge, dismiss, pin)."""
    alert = update_alert_status(db, alert_id, status, notes)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"id": alert.id, "status": alert.status}


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
        "camera": {"asset_id": "DCAM-NODE-3", "name": "Dockside Camera Node 3"},
        "patrol_boat": {"asset_id": "PB-07", "name": "Harbor Patrol 07"},
        "drone": {"asset_id": "UAV-12", "name": "Surveillance Drone 12"},
    }
    asset = asset_registry.get(req.asset_type, asset_registry["camera"])

    verification = VerificationRequestORM(
        id=str(uuid.uuid4()),
        alert_id=req.alert_id,
        vessel_id=req.vessel_id,
        status="assigned",  # Simulate quick assignment
        asset_type=req.asset_type or "camera",
        asset_id=asset["asset_id"],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
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
        result_confidence=None,
        result_notes=None,
        result_media_ref=None,
    )


@router.get("/verification-requests/{request_id}", response_model=VerificationRequestSchema)
def get_verification_request(request_id: str, db: Session = Depends(get_db)):
    """Get verification request status."""
    vr = db.query(VerificationRequestORM).filter(VerificationRequestORM.id == request_id).first()
    if not vr:
        raise HTTPException(status_code=404, detail="Verification request not found")
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
