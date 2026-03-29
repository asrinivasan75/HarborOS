"""FastAPI route handlers."""

from __future__ import annotations
from datetime import datetime, timedelta
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
def _classify_vessel_status(
    positions: list,
    min_stationary_reports: int = 3,
) -> tuple[bool, str | None]:
    """Classify vessel activity status from position history.

    Returns (is_inactive, status_reason).
    Only flags stationary vessels (sustained near-zero speed).
    """
    if not positions:
        return False, None

    if len(positions) >= min_stationary_reports:
        recent = positions[-min_stationary_reports:]
        all_stopped = all(
            p.speed_over_ground is not None and p.speed_over_ground <= 0.3
            for p in recent
        )
        if all_stopped:
            duration_min = (recent[-1].timestamp - recent[0].timestamp).total_seconds() / 60
            if duration_min >= 5:
                return True, f"Stationary for {int(duration_min)} min"

    return False, None

from app.database import get_db
from app.models.domain import (
    VesselORM, PositionReportORM, GeofenceORM, AlertORM, VerificationRequestORM, AlertAuditORM,
    RiskHistoryORM,
    VesselSchema, VesselDetailSchema, GeofenceSchema, AlertSchema, AlertAuditSchema,
    AlertActionRequest, DetectionMetricsSchema,
    RiskDistributionSchema, RiskTierSchema, RiskHistogramBinSchema,
    VerificationRequestSchema, VerificationRequestCreate,
    RiskAssessmentSchema, AnomalySignalSchema, PositionReportSchema,
    RiskHistorySchema, WeatherSchema,
)
from app.services.anomaly_detection import run_anomaly_detection
from app.services.risk_scoring import compute_risk_assessment
from app.services.alert_service import get_alerts, update_alert_status, generate_alerts_for_all_vessels

router = APIRouter()


def _search_satellite_catalog(
    lat: float,
    lng: float,
    windows: list[tuple[float, int, float]] | None = None,
) -> tuple[dict | None, list[float], dict]:
    """Search CDSE catalog with progressively wider windows.

    Each window tuple is (spread_degrees, days_back, max_cloud_cover).
    Returns the first matching catalog hit plus the bbox and search metadata
    used to find it. If no hit is found, returns the widest bbox and the final
    search window metadata.
    """
    from app.data_sources.sentinel_adapter import search_imagery

    search_windows = windows or [
        (0.05, 30, 50.0),
        (0.08, 45, 70.0),
        (0.12, 60, 90.0),
    ]

    fallback_bbox = [lng - search_windows[-1][0], lat - search_windows[-1][0], lng + search_windows[-1][0], lat + search_windows[-1][0]]
    fallback_meta = {
        "spread_deg": search_windows[-1][0],
        "days_back": search_windows[-1][1],
        "max_cloud_cover": search_windows[-1][2],
    }

    for spread, days_back, max_cloud_cover in search_windows:
        bbox = [lng - spread, lat - spread, lng + spread, lat + spread]
        results = search_imagery(
            bbox=bbox,
            days_back=days_back,
            max_cloud_cover=max_cloud_cover,
            limit=1,
        )
        if results:
            return results[0], bbox, {
                "spread_deg": spread,
                "days_back": days_back,
                "max_cloud_cover": max_cloud_cover,
            }

    return None, fallback_bbox, fallback_meta


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
        
    rows = rows.order_by(
        AlertORM.risk_score.desc().nulls_last(),
        PositionReportORM.timestamp.desc().nulls_last()
    )
    rows = rows.limit(limit).offset(offset).all()

    items = []
    for v, pos, alert in rows:
        is_inactive = False
        status_reason = None

        if not pos:
            is_inactive = True
            status_reason = "No position data"
        elif pos.speed_over_ground is not None and pos.speed_over_ground <= 0.1:
            is_inactive = True
            status_reason = "Stationary"

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
            is_inactive=is_inactive,
            is_resolved=False, # Optimized out of bulk list
            status_reason=status_reason,
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

    is_inactive = False
    is_resolved = False
    status_reason = None
    
    # Check if latest alert was resolved by an operator (not auto-resolved by system)
    latest_alert = db.query(AlertORM).filter(AlertORM.vessel_id == vessel_id).order_by(AlertORM.created_at.desc()).first()
    if latest_alert and latest_alert.status in ("resolved", "dismissed"):
        if latest_alert.operator_notes:
            is_resolved = True
            status_reason = f"Resolved — {latest_alert.operator_notes}"
    
    # Check physical state
    if positions and not is_resolved:
        is_inactive, status_reason = _classify_vessel_status(positions)
    # Fetch weather conditions for vessel position (lazy — only on detail view)
    weather_schema = None
    if positions:
        try:
            from app.data_sources.nws_adapter import get_weather
            weather = get_weather(positions[-1].latitude, positions[-1].longitude)
            if weather:
                weather_schema = WeatherSchema(
                    wind_speed_kt=weather.wind_speed_kt,
                    wind_direction=weather.wind_direction,
                    visibility_nm=weather.visibility_nm,
                    temperature_f=weather.temperature_f,
                    description=weather.description,
                )
        except Exception:
            pass

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
        is_inactive=is_inactive,
        is_resolved=is_resolved,
        status_reason=status_reason,
        weather=weather_schema,
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


@router.get("/vessels/{vessel_id}/risk-history")
def get_risk_history(
    vessel_id: str,
    hours: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Get risk score history for sparkline trend visualization."""
    vessel = db.query(VesselORM).filter(VesselORM.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")

    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(RiskHistoryORM)
        .filter(
            RiskHistoryORM.vessel_id == vessel_id,
            RiskHistoryORM.timestamp >= cutoff,
        )
        .order_by(RiskHistoryORM.timestamp)
        .all()
    )
    return [
        RiskHistorySchema(
            vessel_id=r.vessel_id,
            risk_score=r.risk_score,
            recommended_action=r.recommended_action,
            timestamp=r.timestamp,
        )
        for r in rows
    ]


# ── Alerts ─────────────────────────────────────────────

@router.get("/alerts")
def list_alerts(
    status: str | None = Query(None, description="Filter by status"),
    region: str | None = Query(None, description="Filter by region key"),
    limit: int = Query(500, ge=1, le=2000),
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

@router.get("/analytics/distribution", response_model=RiskDistributionSchema)
def get_risk_distribution(db: Session = Depends(get_db)):
    """Get histogram and action tier breakdown for all alerts."""
    # Get all alerts
    alerts = db.query(AlertORM).all()
    
    active_scores = [a.risk_score for a in alerts if a.status == "active"]
    resolved_scores = [a.risk_score for a in alerts if a.status == "resolved"]

    # 1. Histogram (5-point bins)
    bins = {}
    for i in range(0, 100, 5):
        bins[i] = {"active": 0, "resolved": 0}
        
    for s in active_scores:
        b = int(s // 5) * 5
        if b in bins:
            bins[b]["active"] += 1
            
    for s in resolved_scores:
        b = int(s // 5) * 5
        if b in bins:
            bins[b]["resolved"] += 1
            
    histogram = [
        RiskHistogramBinSchema(
            bin_start=b,
            bin_end=b+4,
            count_active=bins[b]["active"],
            count_resolved=bins[b]["resolved"]
        ) for b in sorted(bins.keys())
    ]
    
    # 2. Tiers (Active only)
    tiers_data = {
        "escalate": {"count": 0, "signals": []},
        "verify":   {"count": 0, "signals": []},
        "monitor":  {"count": 0, "signals": []},
        "ignore":   {"count": 0, "signals": []},
    }
    
    for a in alerts:
        if a.status != "active":
            continue
            
        action = a.recommended_action
        if action not in tiers_data:
            action = "ignore"
            
        tiers_data[action]["count"] += 1
        if a.anomaly_signals_json:
            try:
                sigs = json.loads(a.anomaly_signals_json)
                tiers_data[action]["signals"].extend([s.get("anomaly_type") for s in sigs if s.get("anomaly_type")])
            except Exception:
                pass
                
    tiers = []
    for action in ["escalate", "verify", "monitor", "ignore"]:
        data = tiers_data[action]
        cnt = data["count"]
        sigs = data["signals"]
        avg = len(sigs) / cnt if cnt > 0 else 0.0
        
        # Top signals
        from collections import Counter
        top = dict(Counter(sigs).most_common(3))
        
        tiers.append(RiskTierSchema(
            action=action,
            count=cnt,
            avg_signals=round(avg, 1),
            top_signals=top
        ))
        
    return RiskDistributionSchema(histogram=histogram, tiers=tiers)


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
    """Create a verification request. Uses real Sentinel-2 data when CDSE is configured."""
    asset_registry = {
        "camera": {"asset_id": "DCAM-NODE-3", "name": "Dockside Camera Node 3", "eta_min": 4},
        "patrol_boat": {"asset_id": "PB-07", "name": "Harbor Patrol 07", "eta_min": 12},
        "drone": {"asset_id": "UAV-12", "name": "Surveillance Drone 12", "eta_min": 8},
        "satellite": {"asset_id": "SENTINEL-2A", "name": "Sentinel-2A (ESA)", "eta_min": 47},
    }
    asset = asset_registry.get(req.asset_type, asset_registry["camera"])

    is_satellite = (req.asset_type == "satellite")
    now = datetime.utcnow()

    last_pass_notes = None
    last_pass_confidence = None
    last_pass_media = None

    if is_satellite:
        from app.data_sources.sentinel_adapter import is_configured

        # Get vessel position for bbox
        vessel = db.query(VesselORM).filter(VesselORM.id == req.vessel_id).first()
        lat, lng = 33.73, -118.26  # fallback
        if vessel:
            latest_pos = (
                db.query(PositionReportORM)
                .filter(PositionReportORM.vessel_id == vessel.id)
                .order_by(PositionReportORM.timestamp.desc())
                .first()
            )
            if latest_pos:
                lat, lng = latest_pos.latitude, latest_pos.longitude

        if is_configured():
            hit, bbox, search_meta = _search_satellite_catalog(lat, lng)

            if hit:
                last_pass_notes = json.dumps({
                    "last_pass": {
                        "acquired": hit["datetime"],
                        "satellite": hit["satellite"],
                        "resolution_m": 10,
                        "cloud_cover_pct": round(hit["cloud_cover"], 1) if hit["cloud_cover"] is not None else None,
                        "bands": "True Color (B4/B3/B2)",
                        "status": "delivered",
                        "catalog_id": hit["id"],
                    },
                    "next_pass": {
                        "eta_minutes": asset["eta_min"],
                        "satellite": "Sentinel-2B",
                        "expected_resolution_m": 10,
                        "status": "tasking_accepted",
                    },
                    "source": "copernicus",
                    "search": search_meta,
                    "vessel_lat": lat,
                    "vessel_lng": lng,
                })
                cloud = hit["cloud_cover"] or 10
                last_pass_confidence = round(0.7 - (cloud / 100) * 0.3, 2)
                last_pass_media = f"/api/satellite/verification-image/PLACEHOLDER?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
            else:
                # No catalog hit yet. Stay on the real Copernicus path and let the
                # Process API render the latest available mosaic for the area.
                date_to = now.strftime("%Y-%m-%d")
                date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
                last_pass_notes = json.dumps({
                    "last_pass": {
                        "acquired": None,
                        "satellite": "Sentinel-2",
                        "resolution_m": 10,
                        "bands": "True Color (B4/B3/B2)",
                        "status": "catalog_empty",
                        "note": "No recent catalog hit for the vessel area. Rendering the latest available Copernicus mosaic.",
                    },
                    "next_pass": {
                        "eta_minutes": asset["eta_min"],
                        "satellite": "Sentinel-2B",
                        "expected_resolution_m": 10,
                        "status": "tasking_accepted",
                    },
                    "source": "copernicus",
                    "catalog_status": "empty",
                    "search": search_meta,
                    "vessel_lat": lat,
                    "vessel_lng": lng,
                })
                last_pass_confidence = 0.45
                last_pass_media = (
                    f"/api/satellite/verification-image/PLACEHOLDER"
                    f"?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
                    f"&date_from={date_from}&date_to={date_to}"
                )
        else:
            # No CDSE configured — simulated
            last_pass_notes = _simulated_satellite_notes(now, asset, lat, lng)
            last_pass_confidence, last_pass_media = _simulated_satellite_media(now)

    vr_id = str(uuid.uuid4())

    # Fix up the media ref with the real verification ID
    if last_pass_media and "PLACEHOLDER" in last_pass_media:
        last_pass_media = last_pass_media.replace("PLACEHOLDER", vr_id)

    verification = VerificationRequestORM(
        id=vr_id,
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


def _simulated_satellite_notes(now: datetime, asset: dict, lat: float, lng: float) -> str:
    """Generate simulated satellite notes when CDSE is not configured."""
    import random
    days_ago = random.randint(1, 4)
    cloud_cover = random.randint(5, 35)
    return json.dumps({
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
        "source": "simulated",
        "vessel_lat": lat,
        "vessel_lng": lng,
    })


def _simulated_satellite_media(now: datetime) -> tuple[float, str]:
    """Generate simulated confidence and media ref."""
    import random
    days_ago = random.randint(1, 4)
    cloud_cover = random.randint(5, 35)
    confidence = round(0.7 - (cloud_cover / 100) * 0.3, 2)
    media = f"s2_tile_{now.strftime('%Y%m%d')}_{days_ago}d_ago.tif"
    return confidence, media


@router.get("/verification-requests/{request_id}", response_model=VerificationRequestSchema)
def get_verification_request(request_id: str, db: Session = Depends(get_db)):
    """Get verification request status.

    For satellite requests, simulates the next pass completing after ~20 seconds
    (compressed from ~47 minutes for demo purposes).
    """
    vr = db.query(VerificationRequestORM).filter(VerificationRequestORM.id == request_id).first()
    if not vr:
        raise HTTPException(status_code=404, detail="Verification request not found")

    # Satellite pass completion (20s delay for demo pacing)
    if vr.asset_type == "satellite" and vr.status == "in_progress":
        elapsed = (datetime.utcnow() - vr.created_at).total_seconds()
        if elapsed > 20:
            from app.data_sources.sentinel_adapter import is_configured

            existing = json.loads(vr.result_notes) if vr.result_notes else {}
            is_real = existing.get("source") == "copernicus"

            if is_real and is_configured():
                lat = existing.get("vessel_lat", 33.73)
                lng = existing.get("vessel_lng", -118.26)
                hit, bbox, search_meta = _search_satellite_catalog(
                    lat,
                    lng,
                    windows=[
                        (0.05, 10, 30.0),
                        (0.08, 21, 50.0),
                        (0.12, 45, 80.0),
                    ],
                )

                if hit:
                    existing["next_pass"] = {
                        "acquired": hit["datetime"],
                        "satellite": hit["satellite"],
                        "resolution_m": 10,
                        "cloud_cover_pct": round(hit["cloud_cover"], 1) if hit["cloud_cover"] is not None else None,
                        "bands": "True Color (B4/B3/B2)",
                        "status": "delivered",
                        "catalog_id": hit["id"],
                    }
                    existing["search"] = search_meta
                    cloud = hit["cloud_cover"] or 5
                    vr.result_confidence = round(0.85 - (cloud / 100) * 0.2, 2)
                    bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
                    vr.result_media_ref = f"/api/satellite/verification-image/{vr.id}?bbox={bbox_str}"
                else:
                    # Catalog empty — keep the request on the real Copernicus path
                    # and ask the Process API for the latest available mosaic.
                    date_to = datetime.utcnow().strftime("%Y-%m-%d")
                    date_from = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
                    bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
                    existing["next_pass"] = {
                        "acquired": datetime.utcnow().isoformat() + "Z",
                        "satellite": "Sentinel-2",
                        "resolution_m": 10,
                        "status": "delivered",
                        "note": "No catalog item found for this window. Rendering the latest available Copernicus mosaic.",
                    }
                    existing["source"] = "copernicus"
                    existing["catalog_status"] = "empty"
                    existing["search"] = search_meta
                    vr.result_confidence = 0.55
                    vr.result_media_ref = (
                        f"/api/satellite/verification-image/{vr.id}"
                        f"?bbox={bbox_str}&date_from={date_from}&date_to={date_to}"
                    )
            else:
                # Simulated completion
                import random
                cloud_cover = random.randint(2, 15)
                existing["next_pass"] = {
                    "acquired": datetime.utcnow().isoformat() + "Z",
                    "satellite": "Sentinel-2B",
                    "resolution_m": 10,
                    "cloud_cover_pct": cloud_cover,
                    "bands": "True Color (B4/B3/B2)",
                    "status": "delivered",
                }
                vr.result_confidence = round(0.85 - (cloud_cover / 100) * 0.2, 2)
                vr.result_media_ref = f"s2_tile_{datetime.utcnow().strftime('%Y%m%d')}_fresh.tif"

            vr.status = "completed"
            vr.result_notes = json.dumps(existing)
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

@router.get("/satellite/verification-image/{request_id}")
def satellite_verification_image(
    request_id: str,
    bbox: str = Query(..., description="west,south,east,north"),
    width: int = Query(512, ge=64, le=2500),
    height: int = Query(512, ge=64, le=2500),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Serve real Sentinel-2 imagery for a verification request.

    Fetches from Copernicus Process API and returns a PNG.
    """
    from fastapi.responses import Response
    from app.data_sources.sentinel_adapter import get_imagery_png, is_configured

    if not is_configured():
        raise HTTPException(status_code=503, detail="CDSE not configured")

    # Verify the request exists
    vr = db.query(VerificationRequestORM).filter(VerificationRequestORM.id == request_id).first()
    if not vr:
        raise HTTPException(status_code=404, detail="Verification request not found")

    parts = [float(x) for x in bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")

    png_bytes = get_imagery_png(
        bbox=parts,
        width=width,
        height=height,
        date_from=date_from,
        date_to=date_to,
    )
    if png_bytes is None:
        raise HTTPException(status_code=502, detail="Failed to fetch imagery from Copernicus")

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/satellite/info")
def satellite_info():
    """Get Sentinel-2 satellite constellation info and tile URLs."""
    from app.data_sources.sentinel_adapter import get_sentinel2_tile_url, get_sentinel2_info
    return {
        "tiles": get_sentinel2_tile_url(),
        "constellation": get_sentinel2_info(),
    }


@router.get("/satellite/search")
def satellite_search(
    west: float = Query(..., description="Bounding box west longitude"),
    south: float = Query(..., description="Bounding box south latitude"),
    east: float = Query(..., description="Bounding box east longitude"),
    north: float = Query(..., description="Bounding box north latitude"),
    days_back: int = Query(60, ge=1, le=365),
    max_cloud_cover: float = Query(60, ge=0, le=100),
    limit: int = Query(5, ge=1, le=20),
):
    """Search for recent Sentinel-2 acquisitions over an area.

    Returns a list of available images with dates, cloud cover, and geometry.
    Requires CDSE_CLIENT_ID and CDSE_CLIENT_SECRET env vars.
    """
    from app.data_sources.sentinel_adapter import search_imagery, is_configured
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Sentinel-2 not configured. Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET.",
        )
    results = search_imagery(
        bbox=[west, south, east, north],
        days_back=days_back,
        max_cloud_cover=max_cloud_cover,
        limit=limit,
    )
    return {"results": results, "count": len(results)}


@router.get("/satellite/imagery")
def satellite_imagery(
    west: float = Query(..., description="Bounding box west longitude"),
    south: float = Query(..., description="Bounding box south latitude"),
    east: float = Query(..., description="Bounding box east longitude"),
    north: float = Query(..., description="Bounding box north latitude"),
    width: int = Query(512, ge=64, le=2500),
    height: int = Query(512, ge=64, le=2500),
    date_from: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="End date (YYYY-MM-DD)"),
):
    """Render Sentinel-2 true color imagery for a bounding box via Process API.

    Returns a PNG image. Uses the most recent cloud-free mosaic.
    Requires CDSE_CLIENT_ID and CDSE_CLIENT_SECRET env vars.
    """
    from fastapi.responses import Response
    from app.data_sources.sentinel_adapter import get_imagery_png, is_configured

    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Sentinel-2 not configured. Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET.",
        )

    png_bytes = get_imagery_png(
        bbox=[west, south, east, north],
        width=width,
        height=height,
        date_from=date_from,
        date_to=date_to,
    )
    if png_bytes is None:
        raise HTTPException(status_code=502, detail="Failed to fetch imagery from Copernicus")

    return Response(content=png_bytes, media_type="image/png")


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


# ── Edge Node (SeaPod / Raspberry Pi) ─────────────────

# Demo transformation constants
_GPS_LAT_OFFSET = 0.0     # No offset — show real GPS position (Philly)
_GPS_LON_OFFSET = 0.0
_RANGE_SCALE = 6173        # 1.2m pool -> ~4 nautical miles

def _calculate_target_position(lat: float, lon: float, distance_nm: float, heading_deg: float) -> tuple[float, float]:
    """Calculate target lat/lon from origin + distance + heading using great-circle math."""
    import math
    R = 3440.065  # Earth radius in nautical miles
    d = distance_nm / R
    brng = math.radians(heading_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brng))
    lon2 = lon1 + math.atan2(math.sin(brng) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), math.degrees(lon2)


@router.post("/edge-node/alert")
def receive_edge_node_alert(
    payload: dict,
    db: Session = Depends(get_db),
):
    """Receive a detection alert from a SeaPod edge node (Raspberry Pi).

    Accepts JSON from the Pi, applies demo transformations (GPS transposition,
    range scaling), creates vessel + alert records, and returns confirmation.
    The frontend auto-picks this up on the next 5-second refresh cycle.
    """
    node_id = payload.get("node") or "SeaPod_Unknown"
    raw_lat = payload.get("lat")
    raw_lon = payload.get("lon")
    distance_m = payload.get("distance_m")
    heading_deg = payload.get("heading_deg")
    confidence = payload.get("confidence")
    target_name = payload.get("target") or "unknown_object"
    stream_url = payload.get("stream_url")

    # Handle nulls with safe defaults
    # GPS: if null, use default Philly coordinates (demo fallback)
    if raw_lat is None or raw_lon is None:
        raw_lat = raw_lat if raw_lat is not None else 39.9526
        raw_lon = raw_lon if raw_lon is not None else -75.1652
        gps_status = "no_fix"
    else:
        gps_status = "locked"

    # Distance: if null, default to 1m (duck is close)
    if distance_m is None:
        distance_m = 1.0

    # Heading: if null, randomize (no magnetometer)
    if heading_deg is None:
        import random
        heading_deg = random.uniform(0, 360)

    # Confidence: if null, use low default
    if confidence is None:
        confidence = 0.5

    # Demo transformations
    demo_lat = raw_lat + _GPS_LAT_OFFSET
    demo_lon = raw_lon + _GPS_LON_OFFSET
    scaled_distance_nm = (distance_m * _RANGE_SCALE) / 1852  # meters -> nm
    target_lat, target_lon = _calculate_target_position(demo_lat, demo_lon, scaled_distance_nm, heading_deg)

    now = datetime.utcnow()

    # Upsert SeaPod node vessel
    node_vessel_id = f"seapod-{node_id.lower().replace(' ', '-')}"
    node_vessel = db.query(VesselORM).filter(VesselORM.id == node_vessel_id).first()
    if not node_vessel:
        node_vessel = VesselORM(
            id=node_vessel_id,
            mmsi=f"SEAPOD-{node_id.upper()}",
            name=node_id,
            vessel_type="sensor_node",
            flag_state="United States",
            region="seapod_live",
        )
        db.add(node_vessel)
        db.flush()

    # Update node position
    node_pos = PositionReportORM(
        vessel_id=node_vessel_id,
        timestamp=now,
        latitude=demo_lat,
        longitude=demo_lon,
        speed_over_ground=0,
        course_over_ground=heading_deg,
        heading=heading_deg,
    )
    db.add(node_pos)

    # Upsert dark vessel (the detected target)
    dark_vessel_id = f"dark-{node_id.lower()}-target"
    dark_vessel = db.query(VesselORM).filter(VesselORM.id == dark_vessel_id).first()
    if not dark_vessel:
        dark_vessel = VesselORM(
            id=dark_vessel_id,
            mmsi=f"DARK-{node_id.upper()}",
            name="UNIDENTIFIED DARK VESSEL",
            vessel_type="other",
            flag_state="Unknown",
            region="seapod_live",
            inspection_deficiencies=0,
        )
        db.add(dark_vessel)
        db.flush()

    # Update dark vessel position
    dark_pos = PositionReportORM(
        vessel_id=dark_vessel_id,
        timestamp=now,
        latitude=target_lat,
        longitude=target_lon,
        speed_over_ground=0,
        course_over_ground=0,
        heading=0,
    )
    db.add(dark_pos)

    alert = db.query(AlertORM).filter(
        AlertORM.vessel_id == dark_vessel_id, AlertORM.status == "active"
    ).first()

    signal = {
        "anomaly_type": "dark_ship_optical",
        "severity": confidence,
        "description": f"Optical detection by {node_id}: unregistered vessel at {target_lat:.4f}N {abs(target_lon):.4f}W, range {scaled_distance_nm:.1f} nm, confidence {confidence*100:.0f}%. No AIS transponder detected.",
        "details": {
            "source": "edge_node",
            "node_id": node_id,
            "raw_distance_m": distance_m,
            "scaled_distance_nm": round(scaled_distance_nm, 2),
            "heading_deg": heading_deg,
            "stream_url": stream_url,
        },
    }

    explanation = (
        f"OPTICAL DARK SHIP DETECTION by {node_id}. "
        f"Unregistered vessel detected at range {scaled_distance_nm:.1f} nm, bearing {heading_deg}°. "
        f"No AIS transponder signal. Detection confidence: {confidence*100:.0f}%. "
        f"This vessel does not appear in any AIS database."
    )

    # Apply standard risk scoring matrix instead of bypassing it
    schema = AnomalySignalSchema(**signal)
    assessment = compute_risk_assessment(dark_vessel, [schema])
    risk_score = assessment.risk_score

    if alert:
        alert.risk_score = risk_score
        alert.recommended_action = assessment.recommended_action
        alert.explanation = explanation
        alert.anomaly_signals_json = json.dumps([signal])
    else:
        alert = AlertORM(
            id=str(uuid.uuid4()),
            vessel_id=dark_vessel_id,
            risk_score=risk_score,
            recommended_action=assessment.recommended_action,
            explanation=explanation,
            anomaly_signals_json=json.dumps([signal]),
        )
        db.add(alert)

    db.commit()

    return {
        "status": "alert_created",
        "node": node_id,
        "gps_status": gps_status,
        "node_position": {"lat": demo_lat, "lon": demo_lon},
        "target_position": {"lat": target_lat, "lon": target_lon},
        "risk_score": risk_score,
        "scaled_distance_nm": round(scaled_distance_nm, 2),
        "heading_used": round(heading_deg, 1),
        "alert_id": alert.id,
        "nulls_received": {
            "lat": payload.get("lat") is None,
            "lon": payload.get("lon") is None,
            "distance_m": payload.get("distance_m") is None,
            "heading_deg": payload.get("heading_deg") is None,
            "confidence": payload.get("confidence") is None,
        },
    }
