"""
Research-backed anomaly detection engine.

Detectors use peer-reviewed formulas and IMO standards:
- Collision risk: Mou et al. 2021 exponential CPA formula with F_angle
- Loitering: F(c) course-change intensity (PMC 2023, 97% accuracy)
- AIS gaps: IMO Class A speed-dependent reporting intervals
- Dark vessels: Speed-aware silence detection (Global Fishing Watch)

Also vessel-type-aware (per-type behavior profiles) and history-aware
(learned baselines from archived Parquet data).
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


def _fmt_type(vessel_type: str | None) -> str:
    """Format vessel type for display: 'high_speed' → 'high speed'."""
    return (vessel_type or "unknown").replace("_", " ")


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

        checked = positions[-10:]
        inside_count = sum(1 for pos in checked if point_in_polygon(pos.latitude, pos.longitude, coords))
        if inside_count > 0:
            base_severity = 0.9 if gf.severity == "high" else 0.6
            # Scale by breach duration: more positions inside = more sustained presence
            ratio = inside_count / len(checked)
            depth_factor = 0.4 + 0.6 * ratio  # 0.46 (1/10) to 1.0 (all inside)
            # Scale by speed: use actual speed value for continuous variation
            latest_speed = positions[-1].speed_over_ground or 0
            speed_factor = 0.5 + 0.5 * min(latest_speed / 15.0, 1.0)
            severity = min(0.65, base_severity * zone_mult * depth_factor * speed_factor)
            signals.append(AnomalySignalSchema(
                anomaly_type=AnomalyType.GEOFENCE_BREACH,
                severity=severity,
                description=f"{inside_count}/{len(checked)} recent positions inside {gf.zone_type} zone \"{gf.name}\". Sustained unauthorized presence.",
                details={"geofence_id": gf.id, "zone_type": gf.zone_type,
                         "vessel_type": vessel.vessel_type, "severity_mult": zone_mult,
                         "positions_inside": inside_count, "positions_checked": len(checked)}
            ))
    return signals


def detect_loitering(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect loitering using F(c) course-change intensity formula.

    F(c) = (Σ|ΔCourse| × Σ Speed) / (180° × BoundingBoxArea)

    Key thresholds from research:
    - Speed 3 kt separates anchored from actively loitering
    - Anchor exclusion: bounding box < 0.17 nm²
    - Higher F(c) = more suspicious turning in a confined area

    Reference: "Loitering Behavior Detection by Spatiotemporal
    Characteristics" (PMC 2023, 97% accuracy, 92% F-score).
    """
    if len(positions) < 5:
        return []

    profile = get_profile(vessel.vessel_type)
    severity_mult = profile["loiter_severity_mult"]

    recent = positions[-30:]  # Larger window for F(c)

    valid = [
        p for p in recent
        if p.speed_over_ground is not None and p.course_over_ground is not None
    ]
    if len(valid) < 5:
        return []

    # Bounding box area (nm²)
    lats = [p.latitude for p in valid]
    lons = [p.longitude for p in valid]
    mean_lat = sum(lats) / len(lats)
    width_nm = (max(lons) - min(lons)) * 60 * math.cos(math.radians(mean_lat))
    height_nm = (max(lats) - min(lats)) * 60
    bbox_area = max(width_nm * height_nm, 0.001)

    # Anchor exclusion: bbox < 0.17 nm² AND avg speed < 3 kt
    speeds = [p.speed_over_ground for p in valid]
    avg_speed = sum(speeds) / len(speeds)
    if bbox_area < 0.17 and avg_speed < 3.0:
        return []

    # F(c) = (Σ|ΔCourse| × Σ Speed) / (180 × BboxArea)
    total_course_change = 0.0
    total_speed = sum(speeds)
    for i in range(1, len(valid)):
        delta = abs(valid[i].course_over_ground - valid[i - 1].course_over_ground)
        if delta > 180:
            delta = 360 - delta
        total_course_change += delta

    fc = (total_course_change * total_speed) / (180.0 * bbox_area)

    time_span_min = (valid[-1].timestamp - valid[0].timestamp).total_seconds() / 60
    if time_span_min < 5 or fc < 50:
        return []

    # Severity from F(c) via log scaling, adjusted by vessel type
    base_severity = min(0.55, 0.15 + math.log10(max(fc, 1)) * 0.10)
    severity = min(0.65, base_severity * severity_mult)
    if severity < 0.05:
        return []

    vtype = _fmt_type(vessel.vessel_type)
    spread_nm = haversine_distance(min(lats), min(lons), max(lats), max(lons))

    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.LOITERING,
        severity=severity,
        description=(
            f"Circling in {spread_nm:.1f}nm area for {int(time_span_min)} min "
            f"({total_course_change:.0f}° course change). "
            f"Possible surveillance, rendezvous, or drop-off activity."
        ),
        details={
            "fc_score": round(fc, 1),
            "total_course_change_deg": round(total_course_change, 0),
            "total_speed_sum_kt": round(total_speed, 1),
            "bbox_area_sqnm": round(bbox_area, 4),
            "duration_minutes": int(time_span_min),
            "spread_nm": round(spread_nm, 3),
            "avg_speed_kt": round(avg_speed, 1),
            "vessel_type": vtype,
            "severity_mult": severity_mult,
            "method": "fc_pmc2023",
        },
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
        # Use both count and max magnitude for continuous variation
        change_factor = min(1.0, max_change / 30) * 0.08
        severity = min(0.65, 0.18 + (large_changes * 0.06) + change_factor)
        # Clearly impossible speeds (>50kt) suggest data quality issues, not evasive behavior
        if max_change > 50:
            severity = min(severity, 0.45)
            cause = "likely data/transponder error"
        else:
            cause = "may indicate evasive maneuvering"
        signals.append(AnomalySignalSchema(
            anomaly_type=AnomalyType.SPEED_ANOMALY,
            severity=severity,
            description=f"{large_changes} rapid speed changes detected (max {max_change:.1f} kt jump, threshold {speed_threshold} kt). {cause.capitalize()}.",
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
                severity = min(0.55, 0.2 + (z_score - 2.5) * 0.10)
                signals.append(AnomalySignalSchema(
                    anomaly_type=AnomalyType.SPEED_ANOMALY,
                    severity=severity,
                    description=f"Averaging {avg_speed:.1f} kt — regional baseline for {_fmt_type(vessel.vessel_type)} is {learned_mean:.1f} kt (±{learned_std:.1f}). Significant deviation from expected pattern.",
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

    # Ships at anchor or moored naturally wobble heading due to wind/current.
    # Only flag heading anomalies for vessels actively underway.
    speeds = [p.speed_over_ground for p in positions if p.speed_over_ground is not None]
    avg_speed = sum(speeds) / len(speeds) if speeds else 0
    if avg_speed < 2.0:
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

    if large_turns < 5:
        return []

    # Use both count and magnitude for continuous variation
    turn_intensity = total_turn / max(len(headings), 1)  # avg degrees per step
    base_severity = min(0.50, 0.10 + (large_turns * 0.035) + (turn_intensity / 180) * 0.12)
    severity = min(0.65, base_severity * severity_mult)

    if severity < 0.05:
        return []

    vtype = _fmt_type(vessel.vessel_type)
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.HEADING_ANOMALY,
        severity=severity,
        description=f"{large_turns} sharp course changes (>{turn_threshold}°), {total_turn:.0f}° total. Possible search pattern or evasive maneuvering.",
        details={"large_turns": large_turns, "total_turn_degrees": round(total_turn, 0),
                 "turn_threshold_deg": turn_threshold, "vessel_type": vtype,
                 "severity_mult": severity_mult}
    )]


def _imo_expected_interval_sec(speed_kt: float, is_turning: bool = False) -> float:
    """IMO Class A mandated AIS reporting interval (seconds).

    Reference: IMO Resolution A.1106(29), ITU-R M.1371.
    """
    if speed_kt < 3:
        return 180.0   # At anchor: 3 min
    elif speed_kt <= 14:
        return 3.3 if is_turning else 10.0
    elif speed_kt <= 23:
        return 2.0 if is_turning else 6.0
    return 2.0          # > 23 kt: always 2 sec


def _speed_gap_threshold_min(speed_kt: float) -> float:
    """Speed-dependent gap alert threshold (minutes).

    Scaled from IMO intervals for realistic system polling rates.
    Faster vessels → shorter acceptable gap.
    """
    if speed_kt < 3:
        return 15.0   # Anchored: lenient
    elif speed_kt <= 14:
        return 6.0    # Slow underway
    elif speed_kt <= 23:
        return 4.0    # Fast underway
    return 3.0         # Very fast: tight threshold


def detect_ais_gap(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect AIS transmission gaps using speed-dependent IMO intervals.

    IMO Class A mandated intervals vary by speed:
      At anchor (<3 kt): every 3 min
      Underway 0-14 kt:  every 10 sec
      Underway 14-23 kt: every 6 sec
      Underway >23 kt:   every 2 sec

    Gap severity scales with the ratio of actual gap to expected interval,
    making gaps at higher speeds more suspicious (more missed reports).

    Reference: IMO Resolution A.1106(29), ITU-R M.1371.
    """
    if len(positions) < 2:
        return []

    profile = get_profile(vessel.vessel_type)

    gaps = []
    for i in range(1, len(positions)):
        gap_sec = (positions[i].timestamp - positions[i - 1].timestamp).total_seconds()
        gap_min = gap_sec / 60

        speed = positions[i - 1].speed_over_ground or 0

        # Detect course changes for interval selection
        is_turning = False
        if (positions[i - 1].course_over_ground is not None
                and i >= 2 and positions[i - 2].course_over_ground is not None):
            delta_cog = abs(positions[i - 1].course_over_ground - positions[i - 2].course_over_ground)
            if delta_cog > 180:
                delta_cog = 360 - delta_cog
            is_turning = delta_cog > 10

        expected_sec = _imo_expected_interval_sec(speed, is_turning)
        gap_ratio = gap_sec / expected_sec if expected_sec > 0 else 0
        threshold_min = _speed_gap_threshold_min(speed)

        if gap_min > threshold_min:
            gaps.append({
                "gap_min": gap_min,
                "speed_kt": speed,
                "gap_ratio": gap_ratio,
                "expected_sec": expected_sec,
            })

    if not gaps:
        return []

    worst = max(gaps, key=lambda g: g["gap_ratio"])

    # Severity from gap ratio (log scale — diminishing returns for very large gaps)
    severity = min(0.55, 0.15 + math.log1p(worst["gap_ratio"] / 100) * 0.15)
    # Boost for fast vessels (more reports missing per minute)
    if worst["speed_kt"] > 14:
        severity = min(0.65, severity * 1.15)

    vtype = _fmt_type(vessel.vessel_type)
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.AIS_GAP,
        severity=severity,
        description=(
            f"{int(worst['gap_min'])} min silent at {worst['speed_kt']:.0f} kt — "
            f"~{int(worst['gap_ratio'])} expected reports missed "
            f"(IMO interval: {worst['expected_sec']:.0f}s at this speed)."
        ),
        details={
            "max_gap_minutes": int(worst["gap_min"]),
            "speed_at_gap_kt": round(worst["speed_kt"], 1),
            "gap_ratio": round(worst["gap_ratio"], 0),
            "expected_interval_sec": round(worst["expected_sec"], 1),
            "total_gaps": len(gaps),
            "vessel_type": vtype,
            "method": "imo_speed_dependent",
        },
    )]


def detect_dark_vessel(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    **kwargs,
) -> list[AnomalySignalSchema]:
    """Detect vessels that have gone dark (stopped transmitting).

    Severity scales with duration AND last known speed — a fast vessel
    going silent is far more concerning than a slow one.

    Reference: Global Fishing Watch (55,000+ deliberate AIS disabling
    events, 1.6M hours/year untracked globally).
    """
    if len(positions) < 4:
        return []

    now = datetime.utcnow()
    last_report = positions[-1].timestamp
    last_speed = positions[-1].speed_over_ground or 0

    minutes_since_last = (now - last_report).total_seconds() / 60

    # Speed-dependent dark threshold
    dark_threshold = _speed_gap_threshold_min(last_speed) * 2.5
    if minutes_since_last < dark_threshold:
        return []

    # Verify vessel was transmitting regularly before going dark
    regular_count = 0
    intervals = []
    for i in range(1, len(positions)):
        interval_min = (positions[i].timestamp - positions[i - 1].timestamp).total_seconds() / 60
        intervals.append(interval_min)
        expected_threshold = _speed_gap_threshold_min(positions[i - 1].speed_over_ground or 0)
        if interval_min < expected_threshold:
            regular_count += 1

    if regular_count < 3:
        return []

    regular_intervals = [iv for iv in intervals if iv < 10]
    avg_interval = sum(regular_intervals) / len(regular_intervals) if regular_intervals else 5.0

    # Severity scales with dark duration
    base_severity = min(0.55, 0.25 + (minutes_since_last / 60) * 0.15)
    # Speed boost: fast vessel going dark is more concerning
    if last_speed > 14:
        base_severity = min(0.65, base_severity * 1.15)
    elif last_speed > 5:
        base_severity = min(0.60, base_severity * 1.1)

    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.AIS_GAP,
        severity=base_severity,
        description=(
            f"No transmission for {int(minutes_since_last)} min — last seen at {last_speed:.0f} kt "
            f"(was reporting every {avg_interval:.1f} min). Possible intentional AIS shutdown."
        ),
        details={
            "minutes_since_last_report": int(minutes_since_last),
            "last_known_speed_kt": round(last_speed, 1),
            "avg_transmission_interval_min": round(avg_interval, 1),
            "regular_interval_count": regular_count,
            "dark_threshold_min": round(dark_threshold, 1),
            "method": "dark_vessel_speed_aware",
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
            severity = min(0.60, 0.3 + (time_in_zone / 120))
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

    # Use jump count + max magnitude for continuous variation
    jump_factor = min(1.0, max_jump_nm / 20) * 0.06
    severity = min(0.55, 0.20 + (impossible_jumps * 0.06) + jump_factor)
    # Extremely large jumps (>10nm) are almost certainly data errors
    if max_jump_nm > 10:
        severity = min(severity, 0.40)
        cause = "likely GPS/AIS data error rather than actual movement"
    elif impossible_jumps >= 3:
        cause = "possible position spoofing or severe equipment malfunction"
    else:
        cause = "may indicate equipment issues or brief data corruption"
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.KINEMATIC_IMPLAUSIBILITY,
        severity=severity,
        description=f"{impossible_jumps} impossible position jump{'s' if impossible_jumps != 1 else ''} (max {max_jump_nm:.1f}nm). {cause.capitalize()}.",
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

    # Combined deviation: speed outlier + erratic heading (above-normal only)
    heading_excess = max(0, heading_ratio - 1.5)  # Only penalize ABOVE-normal variance
    deviation = (speed_z * 0.6) + (heading_excess * 0.4)

    if deviation < 1.0:
        return []

    severity = min(0.65, 0.25 + (deviation * 0.15))
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.STATISTICAL_OUTLIER,
        severity=severity,
        description=f"Behavior deviates significantly from regional fleet (speed z-score {speed_z:.1f}, heading variance {heading_ratio:.1f}x normal).",
        details={
            "speed_z_score": round(speed_z, 2),
            "heading_variance_ratio": round(heading_ratio, 2),
            "deviation_score": round(deviation, 2),
        },
    )]


def _crossing_f(bearing_deg: float) -> float:
    """Crossing encounter F_angle. Peaks at 90° (beam-on) per Mou et al."""
    deviation = abs(bearing_deg - 90) / 60  # 0 at 90°, 1 at edges
    return 1.5 + 7.0 * max(0.0, 1.0 - deviation ** 1.5)


def _compute_f_angle(bearing_deg: float) -> float:
    """Encounter-type multiplier F_angle per Mou et al. 2021.

    Smooth sinusoidal transitions at 45-60° and 150-165° eliminate
    the abrupt risk jumps from the original 2010 formula.

    Head-on (0-45°): F=1.0, Crossing (60-150°): up to 8.5,
    Overtaking (165-180°): F=2.34.
    """
    b = bearing_deg % 360
    if b > 180:
        b = 360 - b  # Symmetry: use 0-180° range

    if b <= 45:
        return 1.0
    elif b <= 60:
        t = (b - 45) / 15
        target = _crossing_f(60)
        return 1.0 + (target - 1.0) * (0.5 - 0.5 * math.cos(math.pi * t))
    elif b <= 150:
        return _crossing_f(b)
    elif b <= 165:
        t = (b - 150) / 15
        cf = _crossing_f(150)
        return cf + (2.34 - cf) * (0.5 - 0.5 * math.cos(math.pi * t))
    else:
        return 2.34


def _encounter_label(bearing_deg: float) -> str:
    b = bearing_deg % 360
    if b > 180:
        b = 360 - b
    if b <= 45:
        return "head-on"
    elif b <= 60:
        return "head-on/crossing"
    elif b <= 150:
        return "crossing"
    elif b <= 165:
        return "crossing/overtaking"
    return "overtaking"


_ENCOUNTER_WHY = {
    "head-on": "Head-on approach — COLREGS Rule 14 requires starboard turn.",
    "head-on/crossing": "Transitional encounter angle.",
    "crossing": "Crossing approach — give-way vessel expected to alter course.",
    "crossing/overtaking": "Transitional encounter angle.",
    "overtaking": "Overtaking approach — COLREGS Rule 13 requires keeping clear.",
}


def detect_collision_risk(
    vessel: VesselORM,
    positions: list[PositionReportORM],
    nearby_vessels: list[tuple] | None = None,
    **kwargs,
) -> list[AnomalySignalSchema]:
    """COLREGS non-compliance: vessel maintaining course on close approach.

    Uses Mou et al. CPA/TCPA formula to identify close encounters, then
    checks whether the vessel is making expected course corrections.
    A vessel that maintains steady heading into a close encounter — instead
    of maneuvering per COLREGS — may indicate hostile intent, autonomous
    operation, or deliberate intimidation.

    In a domain awareness context, we don't care about routine collision
    avoidance. We care about vessels that REFUSE to follow the rules.
    """
    if not nearby_vessels or len(positions) < 2:
        return []

    latest = positions[-1]
    if latest.speed_over_ground is None or latest.course_over_ground is None:
        return []
    if latest.speed_over_ground < 2.0:
        return []

    # Check if vessel has been making course corrections (COLREGS compliance)
    recent_headings = [
        p.course_over_ground for p in positions[-6:]
        if p.course_over_ground is not None
    ]
    is_maneuvering = False
    heading_stability = 0.0
    if len(recent_headings) >= 3:
        changes = []
        for i in range(1, len(recent_headings)):
            delta = abs(recent_headings[i] - recent_headings[i - 1])
            if delta > 180:
                delta = 360 - delta
            changes.append(delta)
        heading_stability = sum(changes) / len(changes)
        # >8° avg change = vessel is actively maneuvering (following COLREGS)
        is_maneuvering = heading_stability > 8.0

    a = 1.5
    b = 12.0

    best_signal = None
    best_cr = 0
    for other_id, other_lat, other_lon, other_sog, other_cog, other_name in nearby_vessels:
        if other_id == vessel.id:
            continue
        if other_sog is None or other_cog is None or other_sog < 2.0:
            continue

        dist_nm = haversine_distance(latest.latitude, latest.longitude, other_lat, other_lon)
        if dist_nm > 1.5:
            continue

        v1_x = latest.speed_over_ground * math.sin(math.radians(latest.course_over_ground))
        v1_y = latest.speed_over_ground * math.cos(math.radians(latest.course_over_ground))
        v2_x = other_sog * math.sin(math.radians(other_cog))
        v2_y = other_sog * math.cos(math.radians(other_cog))

        dx = (other_lon - latest.longitude) * 60 * math.cos(math.radians(latest.latitude))
        dy = (other_lat - latest.latitude) * 60

        dvx = v2_x - v1_x
        dvy = v2_y - v1_y
        rel_speed_sq = dvx ** 2 + dvy ** 2
        if rel_speed_sq < 0.25:
            continue

        tcpa_hours = -(dx * dvx + dy * dvy) / rel_speed_sq
        tcpa_min = tcpa_hours * 60
        if tcpa_min < 0 or tcpa_min > 30:
            continue

        cpa_x = dx + dvx * tcpa_hours
        cpa_y = dy + dvy * tcpa_hours
        dcpa = math.sqrt(cpa_x ** 2 + cpa_y ** 2)

        bearing = math.degrees(math.atan2(dx, dy)) % 360
        f_angle = _compute_f_angle(bearing)

        base_cr = math.exp(-dcpa / a) * math.exp(-tcpa_min / b)
        f_adjusted = 1.0 + math.log(max(f_angle, 1.0)) / math.log(8.5)
        cr = min(1.0, base_cr * f_adjusted)

        if cr < 0.25:
            continue

        severity = min(0.65, cr * 0.65)

        # Defense reframe: vessel following COLREGS is normal — reduce severity.
        # Vessel maintaining steady course into close encounter is suspicious.
        if is_maneuvering:
            severity *= 0.25  # Maneuvering = expected behavior, low concern
        elif heading_stability < 3.0:
            severity = min(0.65, severity * 1.3)  # Dead-steady approach = suspicious

        if severity < 0.08:
            continue

        if cr > best_cr:
            best_cr = cr
            encounter = _encounter_label(bearing)
            dcpa_meters = int(dcpa * 1852)

            if is_maneuvering:
                behavior = "Vessel is maneuvering (COLREGS-compliant), low concern."
            elif heading_stability < 3.0:
                behavior = "Vessel maintaining steady course with no avoidance maneuver — potential COLREGS non-compliance."
            else:
                behavior = "Minimal course correction observed."

            best_signal = AnomalySignalSchema(
                anomaly_type=AnomalyType.COLLISION_RISK,
                severity=severity,
                description=(
                    f"{encounter.title()} approach toward {other_name or other_id} — "
                    f"CPA {dcpa:.2f}nm ({dcpa_meters}m) in {tcpa_min:.0f} min. "
                    f"{behavior}"
                ),
                details={
                    "other_vessel": other_name or other_id,
                    "collision_risk_cr": round(cr, 3),
                    "dcpa_nm": round(dcpa, 3),
                    "tcpa_minutes": round(tcpa_min, 1),
                    "f_angle": round(f_angle, 2),
                    "encounter_type": encounter,
                    "current_distance_nm": round(dist_nm, 3),
                    "heading_stability_deg": round(heading_stability, 1),
                    "is_maneuvering": is_maneuvering,
                    "method": "mou_2021_colregs",
                },
            )

    return [best_signal] if best_signal else []


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

    severity = min(0.60, 0.2 + (off_count / len(recent)) * 0.3 + (max_dist / 20) * 0.08)
    vtype = _fmt_type(vessel.vessel_type)
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.ROUTE_DEVIATION,
        severity=severity,
        description=f"{off_count}/{len(recent)} recent positions outside established route corridor for {vtype} traffic.",
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

    # Speed mismatch: consistently outside expected range.
    # IMPORTANT: Ships at anchor or moored (< 3 kt) are NOT suspicious simply
    # for being slow. Every ship parks eventually. Only flag if speed is
    # actively abnormal (too fast, or slow while clearly underway).
    if avg_speed < expected_lo * 0.5 and expected_lo > 2 and avg_speed >= 3.0:
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

    # Continuous severity: factor count + magnitude of speed deviation
    speed_dev = 0.0
    if avg_speed < expected_lo * 0.5 and expected_lo > 2:
        speed_dev = min(1.0, (expected_lo * 0.5 - avg_speed) / max(expected_lo, 1))
    elif avg_speed > expected_hi * 1.5:
        speed_dev = min(1.0, (avg_speed - expected_hi * 1.5) / max(expected_hi, 1))
    severity = min(0.55, 0.18 + len(mismatch_factors) * 0.12 + speed_dev * 0.08)
    return [AnomalySignalSchema(
        anomaly_type=AnomalyType.TYPE_MISMATCH,
        severity=severity,
        description=f"Declared as '{_fmt_type(vessel.vessel_type)}' but behavior doesn't match: {'; '.join(mismatch_factors)}. Possible identity deception.",
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
