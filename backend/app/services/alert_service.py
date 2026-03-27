"""Alert generation and management service."""

from __future__ import annotations
from datetime import datetime
import json
import uuid

from sqlalchemy.orm import Session

from app.models.domain import (
    VesselORM, PositionReportORM, GeofenceORM,
    AlertORM, AnomalySignalORM, AlertStatus,
    AlertSchema, AnomalySignalSchema
)
from app.services.anomaly_detection import run_anomaly_detection, compute_regional_stats
from app.services.risk_scoring import compute_risk_assessment


def generate_alerts_for_all_vessels(db: Session) -> list[AlertORM]:
    """Run detection + scoring for all vessels, create/update alerts.

    Now includes regional statistical context and nearby-vessel data for
    collision risk analysis per Stach et al. (2023) survey recommendations.
    """
    vessels = db.query(VesselORM).all()
    geofences = db.query(GeofenceORM).all()
    alerts_created = []

    # Pre-compute regional stats for statistical outlier detection
    all_recent_positions = (
        db.query(PositionReportORM)
        .order_by(PositionReportORM.timestamp.desc())
        .limit(5000)
        .all()
    )
    regional_stats = compute_regional_stats(all_recent_positions)

    # Pre-compute latest positions for all vessels (for collision risk)
    latest_positions = {}
    for v in vessels:
        latest = (
            db.query(PositionReportORM)
            .filter(PositionReportORM.vessel_id == v.id)
            .order_by(PositionReportORM.timestamp.desc())
            .first()
        )
        if latest:
            latest_positions[v.id] = (
                v.id, latest.latitude, latest.longitude,
                latest.speed_over_ground, latest.course_over_ground, v.name
            )
    nearby_list = list(latest_positions.values())

    for vessel in vessels:
        positions = (
            db.query(PositionReportORM)
            .filter(PositionReportORM.vessel_id == vessel.id)
            .order_by(PositionReportORM.timestamp)
            .all()
        )

        if not positions:
            continue

        signals = run_anomaly_detection(
            vessel, positions, geofences,
            regional_stats=regional_stats,
            nearby_vessels=nearby_list,
        )

        assessment = compute_risk_assessment(vessel, signals)

        # Skip if risk is negligible (no signals AND good metadata)
        if assessment.risk_score < 10:
            continue

        # Check for existing active alert
        existing = (
            db.query(AlertORM)
            .filter(AlertORM.vessel_id == vessel.id, AlertORM.status == "active")
            .first()
        )

        if existing:
            existing.risk_score = assessment.risk_score
            existing.recommended_action = assessment.recommended_action
            existing.explanation = assessment.explanation
            existing.anomaly_signals_json = json.dumps([s.model_dump() for s in signals])
            alert = existing
        else:
            alert = AlertORM(
                id=str(uuid.uuid4()),
                vessel_id=vessel.id,
                risk_score=assessment.risk_score,
                recommended_action=assessment.recommended_action,
                explanation=assessment.explanation,
                anomaly_signals_json=json.dumps([s.model_dump() for s in signals]),
            )
            db.add(alert)

        # Replace signal records (delete old, insert new — fixes duplication)
        db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == alert.id).delete()
        for signal in signals:
            signal_orm = AnomalySignalORM(
                alert_id=alert.id,
                anomaly_type=signal.anomaly_type,
                severity=signal.severity,
                description=signal.description,
                details_json=json.dumps(signal.details) if signal.details else None,
            )
            db.add(signal_orm)

        alerts_created.append(alert)

    db.commit()
    return alerts_created


def get_alerts(
    db: Session,
    status: str | None = None,
    region: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AlertSchema], int]:
    """Get alerts with vessel info, sorted by risk score desc (paginated)."""
    query = db.query(AlertORM).join(VesselORM)
    if status:
        query = query.filter(AlertORM.status == status)
    if region:
        query = query.filter(VesselORM.region == region)
    query = query.order_by(AlertORM.risk_score.desc())

    total = query.count()
    alerts = query.offset(offset).limit(limit).all()

    result = []
    for alert in alerts:
        signals = json.loads(alert.anomaly_signals_json) if alert.anomaly_signals_json else []
        result.append(AlertSchema(
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
        ))
    return result, total


def update_alert_status(db: Session, alert_id: str, status: str, notes: str | None = None) -> AlertORM | None:
    """Update alert status (acknowledge, dismiss, pin)."""
    alert = db.query(AlertORM).filter(AlertORM.id == alert_id).first()
    if not alert:
        return None
    alert.status = status
    if notes:
        alert.operator_notes = notes
    db.commit()
    db.refresh(alert)
    return alert
