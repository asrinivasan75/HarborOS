"""
Vessel type behavior profiles.

Defines what "normal" looks like for each vessel type so anomaly detection
can adjust thresholds accordingly. A fishing boat loitering is expected;
a cargo ship loitering near an LNG terminal is not.
"""

from __future__ import annotations


# ── Behavior Profiles ─────────────────────────────────
#
# Each profile defines expected operating parameters.
# Detectors use these to adjust thresholds and severity multipliers.
#
#   speed_range:            (min, max) expected knots
#   typical_speed:          cruise speed for this type
#   loiter_tolerance_min:   minutes of loitering before flagging
#   loiter_severity_mult:   severity multiplier (< 1 = less suspicious)
#   heading_change_deg:     degrees of course change before "large turn"
#   heading_severity_mult:  severity multiplier for heading anomalies
#   ais_gap_tolerance_min:  minutes of silence before flagging
#   zone_severity_mult:     multiplier for restricted zone presence
#   speed_delta_threshold:  knots change to flag as rapid acceleration

VESSEL_PROFILES: dict[str, dict] = {
    "cargo": {
        "speed_range": (5, 18),
        "typical_speed": 12,
        "loiter_tolerance_min": 15,
        "loiter_severity_mult": 1.0,
        "heading_change_deg": 30,
        "heading_severity_mult": 1.0,
        "ais_gap_tolerance_min": 10,
        "zone_severity_mult": 1.2,
        "speed_delta_threshold": 3,
    },
    "tanker": {
        "speed_range": (4, 16),
        "typical_speed": 10,
        "loiter_tolerance_min": 25,
        "loiter_severity_mult": 0.8,
        "heading_change_deg": 25,
        "heading_severity_mult": 1.0,
        "ais_gap_tolerance_min": 10,
        "zone_severity_mult": 1.0,
        "speed_delta_threshold": 3,
    },
    "fishing": {
        "speed_range": (0, 12),
        "typical_speed": 5,
        "loiter_tolerance_min": 120,
        "loiter_severity_mult": 0.25,
        "heading_change_deg": 60,
        "heading_severity_mult": 0.25,
        "ais_gap_tolerance_min": 30,
        "zone_severity_mult": 1.5,
        "speed_delta_threshold": 5,
    },
    "tug": {
        "speed_range": (0, 14),
        "typical_speed": 6,
        "loiter_tolerance_min": 60,
        "loiter_severity_mult": 0.3,
        "heading_change_deg": 45,
        "heading_severity_mult": 0.4,
        "ais_gap_tolerance_min": 15,
        "zone_severity_mult": 0.5,
        "speed_delta_threshold": 4,
    },
    "passenger": {
        "speed_range": (8, 25),
        "typical_speed": 18,
        "loiter_tolerance_min": 10,
        "loiter_severity_mult": 1.3,
        "heading_change_deg": 20,
        "heading_severity_mult": 1.3,
        "ais_gap_tolerance_min": 5,
        "zone_severity_mult": 1.3,
        "speed_delta_threshold": 3,
    },
    "pleasure": {
        "speed_range": (0, 20),
        "typical_speed": 8,
        "loiter_tolerance_min": 60,
        "loiter_severity_mult": 0.4,
        "heading_change_deg": 45,
        "heading_severity_mult": 0.35,
        "ais_gap_tolerance_min": 30,
        "zone_severity_mult": 1.0,
        "speed_delta_threshold": 5,
    },
    "military": {
        "speed_range": (0, 35),
        "typical_speed": 15,
        "loiter_tolerance_min": 90,
        "loiter_severity_mult": 0.15,
        "heading_change_deg": 60,
        "heading_severity_mult": 0.15,
        "ais_gap_tolerance_min": 60,
        "zone_severity_mult": 0.2,
        "speed_delta_threshold": 8,
    },
    "law_enforcement": {
        "speed_range": (0, 30),
        "typical_speed": 12,
        "loiter_tolerance_min": 90,
        "loiter_severity_mult": 0.15,
        "heading_change_deg": 60,
        "heading_severity_mult": 0.15,
        "ais_gap_tolerance_min": 30,
        "zone_severity_mult": 0.15,
        "speed_delta_threshold": 8,
    },
}

# Default profile for unknown vessel types — treat as moderately suspicious
_DEFAULT_PROFILE: dict = {
    "speed_range": (0, 20),
    "typical_speed": 10,
    "loiter_tolerance_min": 15,
    "loiter_severity_mult": 1.0,
    "heading_change_deg": 30,
    "heading_severity_mult": 1.0,
    "ais_gap_tolerance_min": 10,
    "zone_severity_mult": 1.0,
    "speed_delta_threshold": 3,
}


def get_profile(vessel_type: str | None) -> dict:
    """Get the behavior profile for a vessel type.

    Returns the default profile for unknown types — never returns None.
    """
    if not vessel_type:
        return _DEFAULT_PROFILE
    return VESSEL_PROFILES.get(vessel_type.lower(), _DEFAULT_PROFILE)


def is_speed_abnormal(speed: float, vessel_type: str | None) -> bool:
    """Check if a speed is outside the expected range for this vessel type."""
    profile = get_profile(vessel_type)
    lo, hi = profile["speed_range"]
    return speed < lo * 0.5 or speed > hi * 1.3
