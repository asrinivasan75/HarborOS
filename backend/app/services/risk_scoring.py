"""
Composite risk scoring engine.

Combines anomaly signals, vessel metadata quality, proximity factors,
and inspection history into a 0-100 risk score with explanation.

Vessel-type-aware: explanations include type context so operators
understand why a fishing boat has lower severity for loitering.
"""

from __future__ import annotations
from typing import Optional

from app.models.domain import (
    VesselORM, AnomalySignalSchema, ActionRecommendation,
    RiskAssessmentSchema, AnomalyType
)
from app.services.vessel_profiles import get_profile


# ── Configurable Weights ───────────────────────────────

SIGNAL_WEIGHTS: dict[str, float] = {
    AnomalyType.GEOFENCE_BREACH: 25,
    AnomalyType.LOITERING: 20,
    AnomalyType.SPEED_ANOMALY: 18,
    AnomalyType.HEADING_ANOMALY: 15,
    AnomalyType.AIS_GAP: 20,
    AnomalyType.ZONE_LINGERING: 18,
    AnomalyType.ROUTE_DEVIATION: 20,             # Off learned corridor — strong contextual signal
    AnomalyType.TYPE_MISMATCH: 16,               # Behavior contradicts declared type
    AnomalyType.COLLISION_RISK: 28,              # Highest weight — immediate safety concern
    AnomalyType.KINEMATIC_IMPLAUSIBILITY: 22,    # Strong indicator of spoofing or bad data
    AnomalyType.STATISTICAL_OUTLIER: 14,         # Contextual — less definitive alone
}

METADATA_QUALITY_WEIGHT = 15   # Points deducted for poor metadata
INSPECTION_WEIGHT = 12         # Points from inspection history

# Operator-tunable sensitivity factor (Wang 2020 "rare behaviour factor")
# 1.0 = default sensitivity
# >1.0 = more aggressive (flags more contacts)
# <1.0 = less aggressive (flags fewer contacts)
SENSITIVITY_FACTOR = 1.0


# ── Scoring Functions ──────────────────────────────────

def score_anomaly_signals(signals: list[AnomalySignalSchema], sensitivity: float = SENSITIVITY_FACTOR) -> tuple[float, dict]:
    """Score from anomaly signals, scaled by operator sensitivity factor.

    Key design: multiple signals of the SAME type don't stack linearly.
    We take the highest severity per type, then add a small bonus for
    additional signals of that type (diminishing returns). This prevents
    "5 collision risks = auto-escalate" in dense waterways.
    """
    # Group signals by type, keep highest severity per type
    by_type: dict[str, list[float]] = {}
    for signal in signals:
        by_type.setdefault(signal.anomaly_type, []).append(signal.severity)

    total = 0.0
    breakdown = {}
    distinct_types = 0

    for anomaly_type, severities in by_type.items():
        weight = SIGNAL_WEIGHTS.get(anomaly_type, 10)
        max_severity = max(severities)
        # Primary contribution from the worst signal of this type
        contribution = weight * max_severity * sensitivity
        # Small bonus for additional signals (capped, diminishing)
        extra_count = len(severities) - 1
        if extra_count > 0:
            contribution += min(extra_count, 2) * 2  # +2 per extra, max +4
        total += contribution
        breakdown[anomaly_type] = round(contribution, 1)
        distinct_types += 1

    # Diversity bonus: multiple DIFFERENT anomaly types compound risk
    if distinct_types >= 3:
        total *= 1.15  # 15% boost for 3+ different signal types
    elif distinct_types >= 2:
        total *= 1.05  # 5% boost for 2 different types

    return min(total, 85), breakdown  # Cap anomaly contribution at 85


def score_metadata_quality(vessel: VesselORM) -> tuple[float, str]:
    """Score based on vessel metadata completeness. Missing info = suspicious."""
    missing = 0
    fields = [vessel.name, vessel.imo, vessel.callsign, vessel.destination, vessel.flag_state]
    for f in fields:
        if not f or f.strip() == "" or f.upper() == "UNKNOWN":
            missing += 1

    if missing == 0:
        return 0, "Complete vessel metadata"
    score = (missing / len(fields)) * METADATA_QUALITY_WEIGHT
    return score, f"Incomplete vessel metadata ({missing} missing fields)"


def score_inspection_history(vessel: VesselORM) -> tuple[float, str]:
    """Score based on inspection deficiencies."""
    deficiencies = vessel.inspection_deficiencies or 0
    if deficiencies == 0:
        return 0, "Clean inspection record"
    score = min(INSPECTION_WEIGHT, deficiencies * 3)
    return score, f"{deficiencies} inspection deficiencies on record"


def determine_action(score: float) -> str:
    """Map risk score to recommended action."""
    if score >= 65:
        return ActionRecommendation.ESCALATE
    elif score >= 35:
        return ActionRecommendation.VERIFY
    elif score >= 15:
        return ActionRecommendation.MONITOR
    return ActionRecommendation.IGNORE


def generate_explanation(
    vessel: VesselORM,
    signals: list[AnomalySignalSchema],
    metadata_note: str,
    inspection_note: str,
    score: float,
    action: str,
) -> str:
    """Generate human-readable explanation of the risk assessment.

    Includes vessel type context so operators understand severity adjustments.
    """
    parts = []

    profile = get_profile(vessel.vessel_type)
    vtype = vessel.vessel_type or "unknown"

    # Vessel type context header
    has_adjusted = any(
        s.details and s.details.get("severity_mult") and s.details["severity_mult"] != 1.0
        for s in signals
    )
    if has_adjusted:
        parts.append(f"[{vtype} profile applied — thresholds adjusted for vessel type.]")

    if signals:
        signal_descriptions = [s.description for s in sorted(signals, key=lambda s: s.severity, reverse=True)]
        parts.append("Anomaly signals detected: " + "; ".join(signal_descriptions) + ".")

    # Flag learned-baseline signals
    learned_signals = [s for s in signals if s.details and s.details.get("source") == "learned_baseline"]
    if learned_signals:
        parts.append(f"({len(learned_signals)} signal(s) from historical pattern analysis.)")

    if "missing" in metadata_note.lower() or "incomplete" in metadata_note.lower():
        parts.append(metadata_note + ".")

    if "deficiencies" in inspection_note.lower():
        parts.append(inspection_note + ".")

    if not parts:
        parts.append("No significant anomalies detected.")

    return " ".join(parts)


# ── Main Scoring Entry Point ──────────────────────────

def compute_risk_assessment(
    vessel: VesselORM,
    signals: list[AnomalySignalSchema],
) -> RiskAssessmentSchema:
    """Compute full risk assessment for a vessel."""
    anomaly_score, anomaly_breakdown = score_anomaly_signals(signals)
    metadata_score, metadata_note = score_metadata_quality(vessel)
    inspection_score, inspection_note = score_inspection_history(vessel)

    total_score = min(100, anomaly_score + metadata_score + inspection_score)
    action = determine_action(total_score)

    explanation = generate_explanation(
        vessel, signals, metadata_note, inspection_note, total_score, action
    )

    breakdown = {
        **anomaly_breakdown,
        "metadata_quality": round(metadata_score, 1),
        "inspection_history": round(inspection_score, 1),
    }

    return RiskAssessmentSchema(
        vessel_id=vessel.id,
        risk_score=round(total_score, 1),
        recommended_action=action,
        explanation=explanation,
        signals=signals,
        signal_breakdown=breakdown,
    )
