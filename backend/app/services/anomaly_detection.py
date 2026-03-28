"""
Heuristic-based anomaly detection engine.

Each detector is a function that takes vessel data and returns anomaly signals.
Modular: add new detectors by adding functions to DETECTORS list.

Vessel-type-aware: detectors use per-type behavior profiles to adjust
thresholds (e.g. fishing boats loitering is normal, cargo ships is not).

History-aware: detectors can compare against learned baselines from
archived Parquet data to flag route deviations and behavioral outliers.
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional
import json
import math

from sqlalchemy.orm import Session

from app.models.domain import (
    VesselORM, PositionReportORM, GeofenceORM,
    AnomalySignalSchema, AnomalyType
)
from app.services.vessel_profiles import get_profile
from app.services.pattern_learning import LearnedBaseline


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in nautical miles between two coordinates."""
    R = 3440.065  # Earth radius in nautical miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def point_in_polygon(lat: float, lon: float, polygon_coords: list) -> bool:
    """Ray-casting point-in-polygon test. Coords are [[lon, lat], ...]."""
    n = len(polygon_coords)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon_coords[i][0], polygon_coords[i][1]
        xj, yj = polygon_coords[j][0], polygon_coords[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


# ── Individual Detectors ───────────────────────────────

def detect_geofence_breach(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    geofences: list[GeofenceORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Check if vessel has entered any restricted geofence zones.

    Severity is adjusted by vessel type: tugs/law enforcement near restricted
    zones is expected, cargo ships or fishing vessels less so.
    """
    signals = []
    if not positions:
        return signals

    profile = get_profile(vessel.vessel_type)
    zone_mult = profile["zone_severity_mult"]

    for gf in geofences:
        if gf.zone_type not in ("restricted", "security", "environmental"):
            continue
        geo = json.loads(gf.geometry_json)
        coords = geo.get("coordinates", [[]])[0]
        if not coords:
            continue

        for pos in positions[-10:]:
            if point_in_polygon(pos.latitude, pos.longitude, coords):
                base_severity = 0.9 if gf.severity == "high" else 0.6
                severity = min(0.95, base_severity * zone_mult)
                signals.append(AnomalySignalSchema(
                    anomaly_type=AnomalyType.GEOFENCE_BREACH,
                    severity=severity,
                    description=f"{vessel.vessel_type or 'Vessel'} entered {gf.zone_type} zone: {gf.name}",
                    details={"geofence_id": gf.id, "zone_type": gf.zone_type,
                             "vessel_type": vessel.vessel_type, "severity_mult": zone_mult}
                ))
                break
    return signals


def detect_loitering(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect if vessel is stationary or near-stationary for too long.

    Threshold and severity are adjusted by vessel type: fishing boats and
    tugs are expected to loiter, cargo ships and passenger vessels are not.
    """
    if len(positions) < 3:
        return []

    profile = get_profile(vessel.vessel_type)
    tolerance_min = profile["loiter_tolerance_min"]
    severity_mult = profile["loiter_severity_mult"]

    recent = positions[-20:]
    slow_count = sum(1 for p in recent if p.speed_over_ground is not None and p.speed_over_ground < 1.0)

    if slow_count < 3:
        return []

    lats = [p.latitude for p in recent]
    lons = [p.longitude for p in recent]
    spread = haversine_distance(min(lats), min(lons), max(lats), max(lons))

    if spread > 0.5:
        return []

    time_span = (recent[-1].timestamp - recent[0].timestamp).total_seconds() / 60
    if time_span < tolerance_min:
        return []

    base_severity = min(0.9, 0.3 + (time_span / 120))
    severity = min(0.95, base_severity * severity_mult)

    if severity < 0.05:
        return []

    vtype = vessel.vessel_type or "unknown"
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.LOITERING,
        severity=severity,
        description=f"{vtype} loitering for {int(time_span)} min in {spread:.2f}nm area (tolerance: {tolerance_min} min for {vtype})",
        details={"duration_minutes": int(time_span), "spread_nm": round(spread, 3),
                 "vessel_type": vtype, "tolerance_min": tolerance_min,
                 "severity_mult": severity_mult}
    )]


def detect_speed_anomaly(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    learned_baseline: LearnedBaseline | None = None,
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect unusual speed changes (rapid acceleration/deceleration).

    Uses vessel type profile for the speed-change threshold: fishing boats
    and military vessels have higher thresholds (speed changes are normal).
    Optionally compares against learned speed distributions.
    """
    if len(positions) < 3:
        return []

    profile = get_profile(vessel.vessel_type)
    speed_threshold = profile["speed_delta_threshold"]

    speeds = [(p.timestamp, p.speed_over_ground) for p in positions if p.speed_over_ground is not None]
    if len(speeds) < 3:
        return []

    large_changes = 0
    max_change = 0
    for i in range(1, len(speeds)):
        delta = abs(speeds[i][1] - speeds[i-1][1])
        if delta > speed_threshold:
            large_changes += 1
            max_change = max(max_change, delta)

    signals = []

    if large_changes >= 2:
        severity = min(0.8, 0.3 + (large_changes * 0.1))
        signals.append(AnomalySignalSchema(
            anomaly_type=AnomalyType.SPEED_ANOMALY,
            severity=severity,
            description=f"Erratic speed changes ({large_changes} rapid changes, max {max_change:.1f} kt delta, threshold: {speed_threshold} kt for {vessel.vessel_type or 'unknown'})",
            details={"rapid_changes": large_changes, "max_delta_knots": round(max_change, 1),
                     "threshold_knots": speed_threshold, "vessel_type": vessel.vessel_type}
        ))

    # Check against learned speed distribution if available
    if learned_baseline:
        baseline = learned_baseline.get_baseline(vessel.region, vessel.vessel_type)
        if baseline and baseline["sample_count"] >= 20:
            current_speeds = [s[1] for s in speeds]
            avg_speed = sum(current_speeds) / len(current_speeds)
            learned_mean = baseline["speed_mean"]
            learned_std = baseline["speed_std"]

            z_score = abs(avg_speed - learned_mean) / learned_std if learned_std > 0.5 else 0
            if z_score > 2.5:
                severity = min(0.75, 0.3 + (z_score - 2.5) * 0.15)
                signals.append(AnomalySignalSchema(
                    anomaly_type=AnomalyType.SPEED_ANOMALY,
                    severity=severity,
                    description=f"Speed deviates from learned pattern: avg {avg_speed:.1f} kt vs historical {learned_mean:.1f}±{learned_std:.1f} kt for {vessel.vessel_type or 'unknown'} in {vessel.region or 'region'}",
                    details={"avg_speed": round(avg_speed, 1), "learned_mean": learned_mean,
                             "learned_std": learned_std, "z_score": round(z_score, 2),
                             "source": "learned_baseline"}
                ))

    return signals


def detect_heading_anomaly(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect unusual heading changes (circling, erratic course).

    Fishing boats and tugs make frequent course changes normally — their
    threshold for "large turn" is much higher than cargo or passenger vessels.
    """
    if len(positions) < 5:
        return []

    profile = get_profile(vessel.vessel_type)
    turn_threshold = profile["heading_change_deg"]
    severity_mult = profile["heading_severity_mult"]

    headings = [p.course_over_ground for p in positions if p.course_over_ground is not None]
    if len(headings) < 5:
        return []

    large_turns = 0
    total_turn = 0
    for i in range(1, len(headings)):
        delta = abs(headings[i] - headings[i-1])
        if delta > 180:
            delta = 360 - delta
        if delta > turn_threshold:
            large_turns += 1
        total_turn += delta

    if large_turns < 3:
        return []

    base_severity = min(0.7, 0.2 + (large_turns * 0.1))
    severity = min(0.85, base_severity * severity_mult)

    if severity < 0.05:
        return []

    vtype = vessel.vessel_type or "unknown"
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.HEADING_ANOMALY,
        severity=severity,
        description=f"Erratic heading changes ({large_turns} turns >{turn_threshold}° for {vtype}, {total_turn:.0f}° total)",
        details={"large_turns": large_turns, "total_turn_degrees": round(total_turn, 0),
                 "turn_threshold_deg": turn_threshold, "vessel_type": vtype,
                 "severity_mult": severity_mult}
    )]


def detect_ais_gap(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect gaps in AIS transmission (possible intentional dark period).

    Military and fishing vessels have longer normal gaps.
    Passenger vessels should transmit constantly.
    """
    if len(positions) < 2:
        return []

    profile = get_profile(vessel.vessel_type)
    gap_tolerance = profile["ais_gap_tolerance_min"]

    gaps = []
    for i in range(1, len(positions)):
        gap = (positions[i].timestamp - positions[i-1].timestamp).total_seconds() / 60
        if gap > gap_tolerance:
            gaps.append(gap)

    if not gaps:
        return []

    max_gap = max(gaps)
    severity = min(0.85, 0.4 + (max_gap / 60) * 0.3)
    vtype = vessel.vessel_type or "unknown"
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.AIS_GAP,
        severity=severity,
        description=f"AIS gap: {int(max_gap)} min gap ({len(gaps)} gaps, tolerance: {gap_tolerance} min for {vtype})",
        details={"max_gap_minutes": int(max_gap), "total_gaps": len(gaps),
                 "gap_tolerance_min": gap_tolerance, "vessel_type": vtype}
    )]


def detect_dark_vessel(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect vessels that have stopped transmitting AIS entirely.

    Unlike detect_ais_gap (which finds gaps within track history), this checks
    whether the vessel's most recent transmission is stale relative to the
    current time — i.e. the vessel has gone dark.
    """
    if len(positions) < 4:
        return []

    now = datetime.utcnow()
    last_report = positions[-1].timestamp

    minutes_since_last = (now - last_report).total_seconds() / 60
    if minutes_since_last < 15:
        return []

    # Check that the vessel was transmitting regularly before going dark:
    # need at least 3 consecutive intervals under 5 minutes.
    regular_count = 0
    intervals = []
    for i in range(1, len(positions)):
        interval_min = (positions[i].timestamp - positions[i - 1].timestamp).total_seconds() / 60
        intervals.append(interval_min)
        if interval_min < 5:
            regular_count += 1

    if regular_count < 3:
        return []

    # Compute average transmission interval from the regular intervals
    regular_intervals = [iv for iv in intervals if iv < 5]
    avg_interval = sum(regular_intervals) / len(regular_intervals)

    # Severity scales with dark duration
    if minutes_since_last >= 60:
        severity = 0.85
    elif minutes_since_last >= 30:
        severity = 0.6
    else:
        severity = 0.4

    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.AIS_GAP,
        severity=severity,
        description=f"Vessel went dark: last transmission {int(minutes_since_last)} minutes ago (was transmitting every {avg_interval:.1f} min)",
        details={
            "minutes_since_last_report": int(minutes_since_last),
            "avg_transmission_interval_min": round(avg_interval, 1),
            "regular_interval_count": regular_count,
        },
    )]


def detect_zone_lingering(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    geofences: list[GeofenceORM],
) -> list[AnomalySignalSchema]:
    """Detect vessel spending too long in a sensitive zone without apparent purpose."""
    signals = []
    if len(positions) < 5:
        return signals

    for gf in geofences:
        if gf.zone_type not in ("security", "restricted"):
            continue
        geo = json.loads(gf.geometry_json)
        coords = geo.get("coordinates", [[]])[0]
        if not coords:
            continue

        in_zone_positions = [
            p for p in positions
            if point_in_polygon(p.latitude, p.longitude, coords)
        ]

        if len(in_zone_positions) < 3:
            continue

        time_in_zone = (in_zone_positions[-1].timestamp - in_zone_positions[0].timestamp).total_seconds() / 60
        if time_in_zone > 20:
            severity = min(0.8, 0.4 + (time_in_zone / 90))
            signals.append(AnomalySignalSchema(
                anomaly_type=AnomalyType.ZONE_LINGERING,
                severity=severity,
                description=f"Vessel lingering in {gf.zone_type} zone '{gf.name}' for {int(time_in_zone)} minutes",
                details={"geofence_id": gf.id, "duration_minutes": int(time_in_zone)}
            ))
    return signals


# ── New Detectors (from Stach et al. 2023 survey) ──────

def detect_kinematic_implausibility(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect physically impossible position jumps or speed values.

    Based on the paper's 'inconsistency' anomaly type: cross-check reported
    position changes against vessel manoeuvrability constraints.
    """
    if len(positions) < 2:
        return []

    impossible_jumps = 0
    max_jump_nm = 0

    for i in range(1, len(positions)):
        dt_hours = (positions[i].timestamp - positions[i-1].timestamp).total_seconds() / 3600
        if dt_hours <= 0:
            continue

        dist_nm = haversine_distance(
            positions[i-1].latitude, positions[i-1].longitude,
            positions[i].latitude, positions[i].longitude,
        )

        # Implied speed from position change
        implied_speed = dist_nm / dt_hours if dt_hours > 0 else 0

        # Most commercial vessels can't exceed ~30 knots; small craft ~50 knots
        max_plausible_speed = 50
        if implied_speed > max_plausible_speed:
            impossible_jumps += 1
            max_jump_nm = max(max_jump_nm, dist_nm)

        # Check for impossibly high reported speed
        sog = positions[i].speed_over_ground
        if sog is not None and sog > max_plausible_speed:
            impossible_jumps += 1

    if impossible_jumps == 0:
        return []

    severity = min(0.9, 0.5 + (impossible_jumps * 0.15))
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.KINEMATIC_IMPLAUSIBILITY,
        severity=severity,
        description=f"Kinematic implausibility: {impossible_jumps} impossible position jump(s) detected (max {max_jump_nm:.1f}nm gap)",
        details={"impossible_jumps": impossible_jumps, "max_jump_nm": round(max_jump_nm, 2)},
    )]


def detect_statistical_outlier(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    all_positions_stats: dict | None = None,
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect vessels whose behavior statistically deviates from regional norms.

    Inspired by the paper's emphasis on descriptive statistics: compare a vessel's
    mean speed, course variance, and position spread against the regional average.
    Uses z-score-like deviation measure.
    """
    if len(positions) < 5 or not all_positions_stats:
        return []

    speeds = [p.speed_over_ground for p in positions if p.speed_over_ground is not None]
    headings = [p.course_over_ground for p in positions if p.course_over_ground is not None]

    if len(speeds) < 3:
        return []

    vessel_mean_speed = sum(speeds) / len(speeds)
    vessel_speed_var = sum((s - vessel_mean_speed) ** 2 for s in speeds) / len(speeds)

    regional_mean_speed = all_positions_stats.get("mean_speed", vessel_mean_speed)
    regional_speed_std = all_positions_stats.get("speed_std", 1.0)

    if regional_speed_std < 0.5:
        regional_speed_std = 0.5  # Avoid division by near-zero

    # Z-score of this vessel's speed variance vs regional norm
    speed_z = abs(vessel_speed_var ** 0.5 - regional_speed_std) / regional_speed_std

    # Course variability: high variance = erratic behavior
    if len(headings) >= 3:
        heading_changes = []
        for i in range(1, len(headings)):
            delta = abs(headings[i] - headings[i-1])
            if delta > 180:
                delta = 360 - delta
            heading_changes.append(delta)
        vessel_heading_var = sum(h ** 2 for h in heading_changes) / len(heading_changes)
        regional_heading_var = all_positions_stats.get("heading_change_var", vessel_heading_var)
        heading_ratio = vessel_heading_var / max(regional_heading_var, 1.0)
    else:
        heading_ratio = 1.0

    # Combined deviation score
    deviation = (speed_z * 0.6) + (max(0, heading_ratio - 1.5) * 0.4)

    if deviation < 1.0:
        return []

    severity = min(0.85, 0.3 + (deviation * 0.2))
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.STATISTICAL_OUTLIER,
        severity=severity,
        description=f"Vessel behavior deviates from regional norms (speed z-score: {speed_z:.1f}, heading variance ratio: {heading_ratio:.1f}x)",
        details={
            "speed_z_score": round(speed_z, 2),
            "heading_variance_ratio": round(heading_ratio, 2),
            "deviation_score": round(deviation, 2),
        },
    )]


def detect_collision_risk(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    nearby_vessels: list[tuple] | None = None,
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect close approach / collision risk (CPA/TCPA analysis).

    Based on the paper's 'collision risk' anomaly type: flag vessels on
    converging courses with small closest point of approach.
    """
    if not nearby_vessels or len(positions) < 1:
        return []

    latest = positions[-1]
    if latest.speed_over_ground is None or latest.course_over_ground is None:
        return []

    # Both vessels must be actively moving — anchored/moored vessels near
    # each other is normal, not a collision risk
    if latest.speed_over_ground < 2.0:
        return []

    signals = []
    for other_id, other_lat, other_lon, other_sog, other_cog, other_name in nearby_vessels:
        if len(signals) >= 2:  # Cap at 2 collision risk signals per vessel
            break
        if other_id == vessel.id:
            continue
        if other_sog is None or other_cog is None:
            continue
        # Other vessel must also be moving
        if other_sog < 2.0:
            continue

        dist_nm = haversine_distance(latest.latitude, latest.longitude, other_lat, other_lon)

        # Only check vessels within 0.5nm
        if dist_nm > 0.5:
            continue

        # Simple CPA estimation: relative velocity approach
        v1_x = latest.speed_over_ground * math.sin(math.radians(latest.course_over_ground))
        v1_y = latest.speed_over_ground * math.cos(math.radians(latest.course_over_ground))
        v2_x = other_sog * math.sin(math.radians(other_cog))
        v2_y = other_sog * math.cos(math.radians(other_cog))

        # Relative position (in approximate nm)
        dx = (other_lon - latest.longitude) * 60 * math.cos(math.radians(latest.latitude))
        dy = (other_lat - latest.latitude) * 60

        # Relative velocity
        dvx = v2_x - v1_x
        dvy = v2_y - v1_y

        rel_speed_sq = dvx ** 2 + dvy ** 2
        if rel_speed_sq < 1.0:
            continue  # Not meaningfully converging

        # Time to CPA
        tcpa = -(dx * dvx + dy * dvy) / rel_speed_sq

        if tcpa < 0 or tcpa > 0.25:  # Only care about next 15 minutes
            continue

        # CPA distance
        cpa_x = dx + dvx * tcpa
        cpa_y = dy + dvy * tcpa
        cpa_dist = math.sqrt(cpa_x ** 2 + cpa_y ** 2)

        if cpa_dist < 0.1:  # CPA within 0.1nm (~185m) is genuinely dangerous
            severity = min(0.95, 0.6 + (0.1 - cpa_dist) * 4)
            tcpa_min = tcpa * 60
            signals.append(AnomalySignalSchema(
                anomaly_type=AnomalyType.COLLISION_RISK,
                severity=severity,
                description=f"Collision risk with {other_name or other_id}: CPA {cpa_dist:.2f}nm in {tcpa_min:.0f} min",
                details={
                    "other_vessel": other_name or other_id,
                    "cpa_nm": round(cpa_dist, 3),
                    "tcpa_minutes": round(tcpa_min, 1),
                    "current_distance_nm": round(dist_nm, 3),
                },
            ))

    return signals


# ── Profile-Aware Detectors ───────────────────────────

def detect_route_deviation(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    learned_baseline: LearnedBaseline | None = None,
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect when a vessel is operating outside learned route corridors.

    Uses historical position density grids built from archived Parquet data.
    Flags vessels that are far from any historically observed traffic for
    their type in this region.
    """
    if not learned_baseline or len(positions) < 3:
        return []

    recent = positions[-5:]
    off_count = 0
    max_dist = 0.0

    for pos in recent:
        is_off, dist = learned_baseline.is_off_corridor(
            pos.latitude, pos.longitude, vessel.region, vessel.vessel_type
        )
        if is_off:
            off_count += 1
            max_dist = max(max_dist, dist)

    if off_count < 2:
        return []

    severity = min(0.8, 0.3 + (off_count / len(recent)) * 0.4 + (max_dist / 20) * 0.1)
    vtype = vessel.vessel_type or "unknown"
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.ROUTE_DEVIATION,
        severity=severity,
        description=f"{vtype} operating outside learned route corridor ({off_count}/{len(recent)} positions off-track, {max_dist:.0f} cells from nearest corridor)",
        details={"off_corridor_positions": off_count, "total_checked": len(recent),
                 "max_distance_cells": round(max_dist, 1), "vessel_type": vtype,
                 "source": "learned_baseline"}
    )]


def detect_type_mismatch(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    learned_baseline: LearnedBaseline | None = None,
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect when a vessel's behavior doesn't match its declared type.

    A vessel registered as 'cargo' but behaving like a fishing boat (low speed,
    erratic heading, loitering) may be misidentified or deliberately disguised.
    Compares vessel behavior against learned baselines for its declared type.
    """
    if len(positions) < 10:
        return []

    profile = get_profile(vessel.vessel_type)
    expected_lo, expected_hi = profile["speed_range"]

    speeds = [p.speed_over_ground for p in positions if p.speed_over_ground is not None]
    headings = [p.course_over_ground for p in positions if p.course_over_ground is not None]

    if len(speeds) < 5:
        return []

    avg_speed = sum(speeds) / len(speeds)
    mismatch_factors = []

    # Speed mismatch: consistently outside expected range
    if avg_speed < expected_lo * 0.5 and expected_lo > 2:
        mismatch_factors.append(f"avg speed {avg_speed:.1f} kt (expected {expected_lo}-{expected_hi} kt)")
    elif avg_speed > expected_hi * 1.5:
        mismatch_factors.append(f"avg speed {avg_speed:.1f} kt (expected {expected_lo}-{expected_hi} kt)")

    # Heading variance mismatch
    if len(headings) >= 5:
        heading_changes = []
        for i in range(1, len(headings)):
            delta = abs(headings[i] - headings[i - 1])
            if delta > 180:
                delta = 360 - delta
            heading_changes.append(delta)
        avg_change = sum(heading_changes) / len(heading_changes) if heading_changes else 0

        # High heading variance for a type that should be steady (cargo, tanker, passenger)
        if vessel.vessel_type in ("cargo", "tanker", "passenger") and avg_change > 40:
            mismatch_factors.append(f"avg heading change {avg_change:.0f}° (unusual for {vessel.vessel_type})")
        # Low heading variance for a type that should be erratic (fishing)
        elif vessel.vessel_type == "fishing" and avg_change < 5 and avg_speed > 10:
            mismatch_factors.append(f"steady course at {avg_speed:.1f} kt (unusual for fishing)")

    if not mismatch_factors:
        return []

    severity = min(0.7, 0.3 + len(mismatch_factors) * 0.2)
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.TYPE_MISMATCH,
        severity=severity,
        description=f"Behavior doesn't match declared type '{vessel.vessel_type}': {'; '.join(mismatch_factors)}",
        details={"vessel_type": vessel.vessel_type, "mismatch_factors": mismatch_factors,
                 "avg_speed": round(avg_speed, 1)}
    )]


# ── Detection Engine ───────────────────────────────────

# Detectors that only need vessel + positions + geofences
BASIC_DETECTORS = [
    detect_geofence_breach,
    detect_loitering,
    detect_speed_anomaly,
    detect_heading_anomaly,
    detect_ais_gap,
    detect_zone_lingering,
    detect_kinematic_implausibility,
    detect_dark_vessel,
]

# Detectors that use learned historical baselines
LEARNED_DETECTORS = [
    detect_route_deviation,
    detect_type_mismatch,
]


def compute_regional_stats(all_positions: list[PositionReportORM]) -> dict:
    """Compute regional statistics for statistical outlier detection."""
    speeds = [p.speed_over_ground for p in all_positions if p.speed_over_ground is not None]
    headings = [p.course_over_ground for p in all_positions if p.course_over_ground is not None]

    if len(speeds) < 10:
        return {}

    mean_speed = sum(speeds) / len(speeds)
    speed_std = (sum((s - mean_speed) ** 2 for s in speeds) / len(speeds)) ** 0.5

    heading_changes = []
    for i in range(1, len(headings)):
        delta = abs(headings[i] - headings[i-1])
        if delta > 180:
            delta = 360 - delta
        heading_changes.append(delta)

    heading_change_var = (sum(h ** 2 for h in heading_changes) / len(heading_changes)) if heading_changes else 100

    return {
        "mean_speed": mean_speed,
        "speed_std": speed_std,
        "heading_change_var": heading_change_var,
    }


def run_anomaly_detection(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    geofences: list[GeofenceORM],
    regional_stats: dict | None = None,
    nearby_vessels: list[tuple] | None = None,
    learned_baseline: LearnedBaseline | None = None,
) -> list[AnomalySignalSchema]:
    """Run all anomaly detectors against a vessel and return combined signals.

    Args:
        vessel: The vessel to analyze
        positions: Time-ordered position reports for this vessel
        geofences: Active geofence zones
        regional_stats: Pre-computed regional statistics for outlier detection
        nearby_vessels: List of (id, lat, lon, sog, cog, name) for collision risk
        learned_baseline: Historical baselines from archived data
    """
    all_signals = []

    # Run basic detectors (vessel-type-aware via profiles)
    for detector in BASIC_DETECTORS:
        try:
            signals = detector(
                vessel=vessel, positions=positions, geofences=geofences,
                learned_baseline=learned_baseline,
            )
            all_signals.extend(signals)
        except Exception:
            continue

    # Run learned-baseline detectors (route deviation, type mismatch)
    for detector in LEARNED_DETECTORS:
        try:
            signals = detector(
                vessel=vessel, positions=positions,
                learned_baseline=learned_baseline,
            )
            all_signals.extend(signals)
        except Exception:
            continue

    # Statistical outlier detection (needs regional context)
    if regional_stats:
        try:
            signals = detect_statistical_outlier(
                vessel=vessel, positions=positions,
                all_positions_stats=regional_stats,
            )
            all_signals.extend(signals)
        except Exception:
            pass

    # Collision risk detection (needs nearby vessel data)
    if nearby_vessels:
        try:
            signals = detect_collision_risk(
                vessel=vessel, positions=positions,
                nearby_vessels=nearby_vessels,
            )
            all_signals.extend(signals)
        except Exception:
            pass

    return all_signals
