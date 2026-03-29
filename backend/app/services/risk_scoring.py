"""
Maritime Domain Awareness risk scoring engine.

Prioritizes defense-relevant signals: AIS dark periods, GPS spoofing,
identity deception, restricted zone violations, and route anomalies.

Action recommendations aligned with ISPS Code MARSEC levels:
  IGNORE    → Below MARSEC 1 (normal traffic)
  MONITOR   → MARSEC 1 (elevated awareness)
  VERIFY    → MARSEC 2 (heightened, dispatch verification)
  ESCALATE  → MARSEC 3 (exceptional, immediate response)
"""

from __future__ import annotations
import math

from app.models.domain import (
    VesselORM, AnomalySignalSchema, ActionRecommendation,
    RiskAssessmentSchema, AnomalyType
)
from app.services.vessel_profiles import get_profile
from app.services.fuzzy_risk import fuzzy_risk_score


# ── Signal Aggregation (pre-fuzzification) ────────────

# Weights prioritized for Maritime Domain Awareness & Interdiction.
# Defense-relevant signals (dark activity, spoofing, deception) rank highest.
# Safety-only signals (close approach with COLREGS compliance) rank lowest.
SIGNAL_WEIGHTS: dict[str, float] = {
    AnomalyType.DARK_SHIP_OPTICAL: 1.0,           # SeaPod optical detection — no AIS at all
    AnomalyType.AIS_GAP: 1.0,                   # Vessels going dark — core MDA signal
    AnomalyType.KINEMATIC_IMPLAUSIBILITY: 0.95,  # GPS spoofing indicator
    AnomalyType.GEOFENCE_BREACH: 0.90,           # Restricted zone violation — interdiction trigger
    AnomalyType.TYPE_MISMATCH: 0.85,             # Identity deception (smuggling, disguise)
    AnomalyType.ROUTE_DEVIATION: 0.80,           # Off-corridor — sanctions evasion, smuggling
    AnomalyType.LOITERING: 0.75,                 # Surveillance, rendezvous, drop-off
    AnomalyType.ZONE_LINGERING: 0.70,            # Critical infrastructure proximity
    AnomalyType.SPEED_ANOMALY: 0.60,             # Evasive maneuvering
    AnomalyType.HEADING_ANOMALY: 0.55,           # Search patterns, evasion
    AnomalyType.STATISTICAL_OUTLIER: 0.50,       # Behavioral anomaly vs fleet
    AnomalyType.COLLISION_RISK: 0.40,            # COLREGS non-compliance (defense reframe)
}

DIVERSITY_BONUS_2 = 1.08   # 2 distinct signal types → 8% boost
DIVERSITY_BONUS_3 = 1.18   # 3+ distinct types → 18% boost


def aggregate_anomaly_severity(signals: list[AnomalySignalSchema]) -> tuple[float, dict]:
    """Aggregate anomaly signals into a single 0-1 severity for fuzzy input.

    Per-type weighting with diminishing returns for repeat signals of the
    same type, plus diversity bonus for multiple distinct signal types.
    """
    if not signals:
        return 0.0, {}

    by_type: dict[str, list[float]] = {}
    for s in signals:
        by_type.setdefault(s.anomaly_type, []).append(s.severity)

    total = 0.0
    breakdown = {}

    for anomaly_type, severities in by_type.items():
        weight = SIGNAL_WEIGHTS.get(anomaly_type, 0.5)
        max_sev = max(severities)
        contribution = weight * max_sev
        extra = min(len(severities) - 1, 2)
        if extra > 0:
            contribution += extra * 0.03
        total += contribution
        breakdown[anomaly_type] = round(contribution, 3)

    distinct = len(by_type)
    if distinct >= 3:
        total *= DIVERSITY_BONUS_3
    elif distinct >= 2:
        total *= DIVERSITY_BONUS_2

    # Normalize to 0-1: divisor calibrated so escalate requires multiple
    # strong defense-relevant signals converging.
    # At 3.5, a single 0.3-severity signal with weight 0.75 → composite ~0.06 (negligible).
    # Escalate requires 3+ strong converging signals to push past 0.7.
    composite = min(1.0, total / 3.5)
    return composite, breakdown


def compute_metadata_deficiency(vessel: VesselORM) -> float:
    """Metadata deficiency as weighted 0-1 value for fuzzy input.

    Fields weighted by maritime security importance (ISPS/SOLAS):
    IMO number and flag state are critical identifiers; missing destination
    is common for local traffic and weighted lower.
    """
    checks = [
        (vessel.imo, 0.30),
        (vessel.flag_state, 0.25),
        (vessel.callsign, 0.20),
        (vessel.name, 0.15),
        (vessel.destination, 0.10),
    ]
    return sum(
        weight for value, weight in checks
        if not value or value.strip() == "" or value.upper() == "UNKNOWN"
    )


def compute_inspection_risk(vessel: VesselORM) -> float:
    """Inspection risk as 0-1 normalized value for fuzzy input."""
    deficiencies = vessel.inspection_deficiencies or 0
    return min(1.0, deficiencies / 5)


_SIGNAL_LABELS = {
    AnomalyType.AIS_GAP: "AIS dark period",
    AnomalyType.KINEMATIC_IMPLAUSIBILITY: "position spoofing indicators",
    AnomalyType.GEOFENCE_BREACH: "restricted zone breach",
    AnomalyType.TYPE_MISMATCH: "identity mismatch",
    AnomalyType.ROUTE_DEVIATION: "route deviation",
    AnomalyType.LOITERING: "loitering behavior",
    AnomalyType.ZONE_LINGERING: "zone lingering",
    AnomalyType.SPEED_ANOMALY: "speed anomaly",
    AnomalyType.HEADING_ANOMALY: "course anomaly",
    AnomalyType.STATISTICAL_OUTLIER: "regional behavioral outlier",
    AnomalyType.COLLISION_RISK: "COLREGS non-compliance",
}

MARSEC_DESCRIPTIONS = {
    "ignore": "Normal traffic — no action needed.",
    "monitor": "Track vessel and log activity.",
    "verify": "Dispatch verification asset (camera, drone, or patrol) to confirm identity and intent.",
    "escalate": "Immediate interdiction response required. Consider area restriction and asset deployment.",
}


def generate_explanation(
    vessel: VesselORM,
    signals: list[AnomalySignalSchema],
    score: float,
    action: str,
    fuzzy_debug: dict,
) -> str:
    """Generate a specific, actionable explanation using actual signal descriptions."""
    if not signals:
        return "No significant anomalies detected."

    vtype = (vessel.vessel_type or "unknown").replace("_", " ")
    vessel_label = vessel.name or f"MMSI {vessel.mmsi}"

    # Use the actual detector descriptions — they contain the real details
    sorted_signals = sorted(signals, key=lambda s: s.severity, reverse=True)

    # Lead with the most critical finding's own description
    lead = sorted_signals[0].description

    # Add supporting signals as brief context
    parts = [lead]
    for s in sorted_signals[1:3]:
        # Use the signal's own description, truncated to the first sentence
        desc = s.description.split(". ")[0]
        parts.append(desc)

    explanation = f"{vessel_label} ({vtype}): {'. '.join(parts)}."
    explanation += f" {MARSEC_DESCRIPTIONS.get(action, '')}"

    return explanation


# ── Main Scoring Entry Point ──────────────────────────

def compute_risk_assessment(
    vessel: VesselORM,
    signals: list[AnomalySignalSchema],
) -> RiskAssessmentSchema:
    """Compute risk assessment using fuzzy inference.

    Pipeline:
    1. Aggregate anomaly signals → composite severity (0-1)
    2. Compute metadata deficiency (0-1)
    3. Compute inspection risk (0-1)
    4. Fuzzy inference → risk score (0-100) + MARSEC action
    """
    anomaly_severity, anomaly_breakdown = aggregate_anomaly_severity(signals)
    metadata_deficiency = compute_metadata_deficiency(vessel)
    inspection_risk = compute_inspection_risk(vessel)

    score, action, fuzzy_debug = fuzzy_risk_score(
        anomaly_severity, metadata_deficiency, inspection_risk
    )

    explanation = generate_explanation(
        vessel, signals, score, action, fuzzy_debug
    )

    breakdown = {
        **anomaly_breakdown,
        "metadata_deficiency": round(metadata_deficiency, 3),
        "inspection_risk": round(inspection_risk, 3),
        "fuzzy_score": score,
    }

    return RiskAssessmentSchema(
        vessel_id=vessel.id,
        risk_score=score,
        recommended_action=action,
        explanation=explanation,
        signals=signals,
        signal_breakdown=breakdown,
    )
