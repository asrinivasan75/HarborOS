"""
Maritime Domain Awareness risk scoring with MARSEC classification.

Anomaly severity drives the base risk score (0-80 points). Metadata
gaps and inspection history amplify existing risk — they make a
suspicious vessel harder to verify but don't create risk on their own.

Action recommendations aligned with ISPS Code MARSEC levels:
  IGNORE    → Below MARSEC 1 (normal traffic)
  MONITOR   → MARSEC 1 (elevated awareness)
  VERIFY    → MARSEC 2 (dispatch verification asset)
  ESCALATE  → MARSEC 3 (immediate interdiction response)
"""

from __future__ import annotations
import math


# ── Membership Functions ─────────────────────────────

def trimf(x: float, params: tuple[float, float, float]) -> float:
    """Triangular membership function. Peaks at 1.0 at b, 0 outside [a, c]."""
    a, b, c = params
    if x <= a or x >= c:
        return 0.0
    elif x <= b:
        return (x - a) / (b - a) if b != a else 1.0
    else:
        return (c - x) / (c - b) if c != b else 1.0


def trapmf(x: float, params: tuple[float, float, float, float]) -> float:
    """Trapezoidal membership function. 1.0 in [b, c], 0 outside [a, d]."""
    a, b, c, d = params
    if x <= a or x >= d:
        return 0.0
    elif x <= b:
        return (x - a) / (b - a) if b != a else 1.0
    elif x <= c:
        return 1.0
    else:
        return (d - x) / (d - c) if d != c else 1.0


# ── Fuzzy Set Definitions ────────────────────────────

# Input: anomaly_severity (0-1 composite from detection signals)
ANOMALY_SETS = {
    "negligible": lambda x: trapmf(x, (0, 0, 0.08, 0.18)),
    "low":        lambda x: trimf(x, (0.10, 0.25, 0.40)),
    "medium":     lambda x: trimf(x, (0.30, 0.50, 0.70)),
    "high":       lambda x: trimf(x, (0.60, 0.78, 0.90)),
    "critical":   lambda x: trapmf(x, (0.82, 0.92, 1.0, 1.0)),
}

# Input: metadata_deficiency (0-1, fraction of missing fields)
METADATA_SETS = {
    "complete": lambda x: trapmf(x, (0, 0, 0.1, 0.25)),
    "partial":  lambda x: trimf(x, (0.15, 0.40, 0.65)),
    "poor":     lambda x: trapmf(x, (0.55, 0.75, 1.0, 1.0)),
}

# Input: inspection_risk (0-1, normalized deficiency count)
INSPECTION_SETS = {
    "clean":    lambda x: trapmf(x, (0, 0, 0.1, 0.3)),
    "moderate": lambda x: trimf(x, (0.2, 0.45, 0.7)),
    "poor":     lambda x: trapmf(x, (0.6, 0.8, 1.0, 1.0)),
}

# Output: risk_level (0-100), aligned with ISPS MARSEC levels
# Tuned so that single low-severity signals stay in MONITOR range,
# and VERIFY/ESCALATE require multiple strong converging signals.
RISK_OUTPUT_SETS = {
    "safe":     lambda x: trapmf(x, (0, 0, 5, 15)),
    "low":      lambda x: trimf(x, (10, 22, 38)),
    "medium":   lambda x: trimf(x, (32, 48, 65)),
    "high":     lambda x: trimf(x, (58, 75, 90)),
    "critical": lambda x: trapmf(x, (82, 92, 100, 100)),
}


# ── Rule Base ────────────────────────────────────────
# (anomaly_level, metadata_level, inspection_level) → risk_output
# None = don't care (wildcard)

RULES: list[tuple[str | None, str | None, str | None, str]] = [
    # Core anomaly-driven rules
    ("negligible", "complete", "clean",    "safe"),
    ("negligible", "complete", None,       "safe"),
    ("negligible", "partial",  None,       "low"),
    ("negligible", "poor",     None,       "low"),
    ("low",        None,       None,       "low"),
    ("low",        "poor",     None,       "medium"),
    ("medium",     None,       None,       "medium"),
    ("medium",     "poor",     None,       "high"),
    ("medium",     None,       "poor",     "high"),
    ("high",       None,       None,       "high"),
    ("high",       "poor",     None,       "critical"),
    ("high",       None,       "poor",     "critical"),
    ("critical",   None,       None,       "critical"),
    # Profile boost rules (suspicious metadata/inspection even with low anomalies)
    ("negligible", "poor",     "poor",     "medium"),
    ("low",        "partial",  "moderate", "medium"),
    ("low",        "poor",     "poor",     "high"),
]


def _evaluate_rule(
    anomaly_val: float,
    metadata_val: float,
    inspection_val: float,
    rule: tuple[str | None, str | None, str | None, str],
) -> float:
    """Evaluate a single fuzzy rule, return firing strength (Mamdani min)."""
    anomaly_level, metadata_level, inspection_level, _ = rule
    strengths = []
    if anomaly_level is not None:
        strengths.append(ANOMALY_SETS[anomaly_level](anomaly_val))
    if metadata_level is not None:
        strengths.append(METADATA_SETS[metadata_level](metadata_val))
    if inspection_level is not None:
        strengths.append(INSPECTION_SETS[inspection_level](inspection_val))
    if not strengths:
        return 0.0
    return min(strengths)


def defuzzify_centroid(activations: dict[str, float], resolution: int = 200) -> float:
    """Centroid defuzzification of aggregated fuzzy output → crisp 0-100."""
    numerator = 0.0
    denominator = 0.0
    for i in range(resolution + 1):
        x = (i / resolution) * 100
        mu = 0.0
        for set_name, strength in activations.items():
            if strength > 0:
                set_mu = RISK_OUTPUT_SETS[set_name](x)
                mu = max(mu, min(set_mu, strength))  # Mamdani: clip then aggregate via max
        numerator += x * mu
        denominator += mu
    if denominator < 1e-10:
        return 0.0
    return numerator / denominator


# ── Main Inference Entry Point ───────────────────────

def fuzzy_risk_score(
    anomaly_severity: float,
    metadata_deficiency: float,
    inspection_risk: float,
) -> tuple[float, str, dict]:
    """Compute risk score using multiplicative formula with MARSEC classification.

    Anomaly severity is the primary risk driver (0-80 base points).
    Metadata deficiency and inspection risk amplify — they make an existing
    anomaly more suspicious but don't create risk on their own.

    Returns (risk_score 0-100, marsec_action, debug_info).
    """
    # Evaluate all fuzzy rules using the raw inputs
    activations = {
        "safe": 0.0,
        "low": 0.0,
        "medium": 0.0,
        "high": 0.0,
        "critical": 0.0,
    }

    for rule in RULES:
        strength = _evaluate_rule(anomaly_severity, metadata_deficiency, inspection_risk, rule)
        result_set = rule[3]
        if strength > activations[result_set]:
            activations[result_set] = strength

    # Defuzzify the aggregated activations using centroid method (0-100)
    score = defuzzify_centroid(activations)
    score = round(score, 1)

    action = marsec_action(score)

    debug = {
        "resolved_score": score,
        "activations": {k: round(v, 3) for k, v in activations.items()},
        "input_anomaly": round(anomaly_severity, 3),
        "input_metadata": round(metadata_deficiency, 3),
        "input_inspection": round(inspection_risk, 3),
    }
    return score, action, debug


def marsec_action(score: float) -> str:
    """Map risk score to ISPS MARSEC-aligned action."""
    if score >= 75:
        return "escalate"   # MARSEC 3
    elif score >= 50:
        return "verify"     # MARSEC 2
    elif score >= 20:
        return "monitor"    # MARSEC 1 (elevated)
    return "ignore"
