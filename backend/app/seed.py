"""
Seed demo data for HarborOS.

Creates realistic vessel traffic scenario at LA Harbor / San Pedro with:
- 15 vessels (1 high-suspicion, 2 moderate, 12 normal)
- Position reports over a 2-hour window
- Geofence zones
- Pre-computed alerts

Run: python -m app.seed
"""

from __future__ import annotations
from datetime import datetime, timedelta
import json
import math
import random
import uuid

from app.database import engine, SessionLocal, Base, init_db
from app.models.domain import (
    VesselORM, PositionReportORM, GeofenceORM,
    AlertORM, AnomalySignalORM, RiskHistoryORM,
)
from app.services.alert_service import generate_alerts_for_all_vessels

# LA Harbor center: ~33.735N, 118.265W
CENTER_LAT = 33.735
CENTER_LON = -118.265
BASE_TIME = datetime(2026, 3, 27, 8, 0, 0)  # 0800 local


# ── Vessel Definitions ─────────────────────────────────

VESSELS = [
    # HIGH SUSPICION — the demo star
    {
        "id": "v-dark-horizon",
        "mmsi": "538006789",
        "name": "MV DARK HORIZON",
        "vessel_type": "cargo",
        "flag_state": "Marshall Islands",
        "length": 89.0, "beam": 14.0, "draft": 5.2,
        "imo": None,  # Missing — suspicious
        "callsign": None,  # Missing — suspicious
        "destination": "UNKNOWN",
        "inspection_deficiencies": 4,
        "last_inspection_date": "2025-06-15",
    },

    # AIS SPOOFING — kinematic implausibility demo
    {
        "id": "v-jade-star",
        "mmsi": "672301456",
        "name": "JADE STAR",
        "vessel_type": "cargo",
        "flag_state": "Comoros",
        "length": 112.0, "beam": 16.5, "draft": 6.1,
        "imo": "9876543",
        "callsign": "D6JS",
        "destination": "LONG BEACH",
        "inspection_deficiencies": 2,
        "last_inspection_date": "2025-09-20",
    },

    # DARK / UNIDENTIFIED — optical detection only (no AIS)
    {
        "id": "v-dark-optical-1",
        "mmsi": "900000001",
        "name": "UNIDENTIFIED VESSEL (Optical)",
        "vessel_type": "unidentified",
        "flag_state": "",
        "length": None, "beam": None, "draft": None,
        "imo": None,
        "callsign": None,
        "destination": "UNKNOWN",
    },

    # ── Normal traffic ──────────────────────────────────

    {
        "id": "v-ever-forward",
        "mmsi": "563012345",
        "name": "EVER FORWARD",
        "vessel_type": "cargo",
        "flag_state": "Singapore",
        "length": 334.0, "beam": 48.2, "draft": 14.5,
        "imo": "9811000",
        "callsign": "9V2345",
        "destination": "LOS ANGELES",
    },
    {
        "id": "v-pacific-guardian",
        "mmsi": "636091234",
        "name": "PACIFIC GUARDIAN",
        "vessel_type": "tanker",
        "flag_state": "Liberia",
        "length": 183.0, "beam": 32.2, "draft": 11.0,
        "imo": "9765432",
        "callsign": "A8LB7",
        "destination": "LONG BEACH",
    },
    {
        "id": "v-port-valor",
        "mmsi": "367890123",
        "name": "PORT VALOR",
        "vessel_type": "tug",
        "flag_state": "United States",
        "length": 30.0, "beam": 10.0, "draft": 4.0,
        "imo": None,
        "callsign": "WDJ1234",
        "destination": "LA HARBOR",
    },
    {
        "id": "v-maria-del-mar",
        "mmsi": "345678901",
        "name": "MARIA DEL MAR",
        "vessel_type": "fishing",
        "flag_state": "Mexico",
        "length": 22.0, "beam": 6.5, "draft": 2.8,
        "imo": None,
        "callsign": "XA9876",
        "destination": "ENSENADA",
    },
    {
        "id": "v-catalina-express",
        "mmsi": "367654321",
        "name": "CATALINA EXPRESS",
        "vessel_type": "passenger",
        "flag_state": "United States",
        "length": 46.0, "beam": 10.0, "draft": 2.2,
        "imo": None,
        "callsign": "WBZ5678",
        "destination": "AVALON",
    },
]


# ── Geofences for LA Harbor ───────────────────────────

GEOFENCES = [
    {
        "id": "gf-restricted-terminal",
        "name": "APM Terminal Restricted Zone",
        "zone_type": "restricted",
        "severity": "high",
        "description": "Restricted area around APM Terminals container operations",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-118.272, 33.748],
                [-118.262, 33.748],
                [-118.262, 33.755],
                [-118.272, 33.755],
                [-118.272, 33.748],
            ]]
        }
    },
    {
        "id": "gf-main-channel",
        "name": "Main Channel",
        "zone_type": "shipping_lane",
        "severity": "medium",
        "description": "Primary shipping channel into LA/Long Beach port complex",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-118.285, 33.700],
                [-118.250, 33.700],
                [-118.250, 33.720],
                [-118.285, 33.720],
                [-118.285, 33.700],
            ]]
        }
    },
    {
        "id": "gf-anchorage-a",
        "name": "Anchorage A",
        "zone_type": "anchorage",
        "severity": "low",
        "description": "Designated anchorage area for vessels awaiting berth",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-118.230, 33.700],
                [-118.210, 33.700],
                [-118.210, 33.720],
                [-118.230, 33.720],
                [-118.230, 33.700],
            ]]
        }
    },
    {
        "id": "gf-security-zone-lng",
        "name": "LNG Terminal Security Zone",
        "zone_type": "security",
        "severity": "high",
        "description": "Security exclusion zone around LNG terminal",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-118.240, 33.740],
                [-118.230, 33.740],
                [-118.230, 33.750],
                [-118.240, 33.750],
                [-118.240, 33.740],
            ]]
        }
    },
    {
        "id": "gf-environmental-preserve",
        "name": "Cabrillo Marine Preserve",
        "zone_type": "environmental",
        "severity": "medium",
        "description": "Environmental protection zone — restricted vessel operations",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-118.295, 33.705],
                [-118.288, 33.705],
                [-118.288, 33.715],
                [-118.295, 33.715],
                [-118.295, 33.705],
            ]]
        }
    },

    # ── Black Sea ─────────────────────────────────────────

    {
        "id": "gf-odesa-port-restricted",
        "name": "Odesa Port Restricted Zone",
        "zone_type": "restricted",
        "severity": "high",
        "description": "Restricted area around Odesa commercial port and grain terminal",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [30.720, 46.490],
                [30.760, 46.490],
                [30.760, 46.475],
                [30.720, 46.475],
                [30.720, 46.490],
            ]]
        }
    },
    {
        "id": "gf-sevastopol-naval-security",
        "name": "Sevastopol Naval Base Security Zone",
        "zone_type": "security",
        "severity": "high",
        "description": "Security exclusion zone around Sevastopol naval base and harbor",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [33.490, 44.635],
                [33.555, 44.635],
                [33.555, 44.600],
                [33.490, 44.600],
                [33.490, 44.635],
            ]]
        }
    },
    {
        "id": "gf-kerch-strait-shipping",
        "name": "Kerch Strait Shipping Lane",
        "zone_type": "shipping_lane",
        "severity": "medium",
        "description": "Main transit corridor through the Kerch Strait connecting Black Sea and Sea of Azov",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [36.540, 45.380],
                [36.660, 45.380],
                [36.660, 45.320],
                [36.540, 45.320],
                [36.540, 45.380],
            ]]
        }
    },
    {
        "id": "gf-bosphorus-approach",
        "name": "Bosphorus Northern Approach Zone",
        "zone_type": "shipping_lane",
        "severity": "medium",
        "description": "Traffic approach zone at the Black Sea entrance to the Bosphorus Strait",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [29.060, 41.230],
                [29.150, 41.230],
                [29.150, 41.170],
                [29.060, 41.170],
                [29.060, 41.230],
            ]]
        }
    },

    # ── Strait of Hormuz ─────────────────────────────────

    {
        "id": "gf-hormuz-tss",
        "name": "Hormuz Traffic Separation Scheme",
        "zone_type": "shipping_lane",
        "severity": "high",
        "description": "IMO-designated traffic separation scheme in the Strait of Hormuz",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [56.400, 26.550],
                [56.600, 26.550],
                [56.600, 26.450],
                [56.400, 26.450],
                [56.400, 26.550],
            ]]
        }
    },
    {
        "id": "gf-bandar-abbas-restricted",
        "name": "Bandar Abbas Port Restricted Zone",
        "zone_type": "restricted",
        "severity": "high",
        "description": "Restricted zone around Bandar Abbas port and naval facility",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [56.240, 27.200],
                [56.320, 27.200],
                [56.320, 27.160],
                [56.240, 27.160],
                [56.240, 27.200],
            ]]
        }
    },

    # ── Taiwan Strait ─────────────────────────────────────

    {
        "id": "gf-taipei-port-security",
        "name": "Taipei Port (Keelung) Security Zone",
        "zone_type": "security",
        "severity": "medium",
        "description": "Port security zone around Taipei/Keelung harbor complex",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [121.420, 25.170],
                [121.480, 25.170],
                [121.480, 25.130],
                [121.420, 25.130],
                [121.420, 25.170],
            ]]
        }
    },
    {
        "id": "gf-taiwan-strait-median",
        "name": "Taiwan Strait Median Line Zone",
        "zone_type": "security",
        "severity": "high",
        "description": "Sensitive median line zone in the Taiwan Strait — military monitoring area",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [119.380, 24.560],
                [119.620, 24.560],
                [119.620, 24.440],
                [119.380, 24.440],
                [119.380, 24.560],
            ]]
        }
    },
    {
        "id": "gf-kaohsiung-port-restricted",
        "name": "Kaohsiung Port Restricted Zone",
        "zone_type": "restricted",
        "severity": "medium",
        "description": "Restricted zone around Kaohsiung container port and naval base",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [120.250, 22.625],
                [120.310, 22.625],
                [120.310, 22.575],
                [120.250, 22.575],
                [120.250, 22.625],
            ]]
        }
    },

    # ── Strait of Malacca ────────────────────────────────

    {
        "id": "gf-singapore-strait-tss",
        "name": "Singapore Strait Traffic Separation Scheme",
        "zone_type": "shipping_lane",
        "severity": "high",
        "description": "IMO-designated TSS in the Singapore Strait — one of the world's busiest waterways",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [103.740, 1.280],
                [103.860, 1.280],
                [103.860, 1.220],
                [103.740, 1.220],
                [103.740, 1.280],
            ]]
        }
    },
    {
        "id": "gf-port-klang-restricted",
        "name": "Port Klang Restricted Zone",
        "zone_type": "restricted",
        "severity": "medium",
        "description": "Restricted zone around Port Klang container terminal and approaches",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [101.310, 3.030],
                [101.390, 3.030],
                [101.390, 2.970],
                [101.310, 2.970],
                [101.310, 3.030],
            ]]
        }
    },

    # ── English Channel ──────────────────────────────────

    {
        "id": "gf-dover-strait-tss",
        "name": "Dover Strait Traffic Separation Scheme",
        "zone_type": "shipping_lane",
        "severity": "high",
        "description": "IMO-designated TSS in the Dover Strait — mandatory reporting for vessels over 300 GT",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [1.340, 51.080],
                [1.460, 51.080],
                [1.460, 51.020],
                [1.340, 51.020],
                [1.340, 51.080],
            ]]
        }
    },
    {
        "id": "gf-southampton-approach",
        "name": "Southampton Approach Zone",
        "zone_type": "shipping_lane",
        "severity": "medium",
        "description": "Precautionary area on the approach to Southampton port via the Solent",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-1.390, 50.875],
                [-1.310, 50.875],
                [-1.310, 50.825],
                [-1.390, 50.825],
                [-1.390, 50.875],
            ]]
        }
    },

    # ── Eastern Mediterranean ────────────────────────────

    {
        "id": "gf-tartus-naval-security",
        "name": "Tartus Naval Base Security Zone",
        "zone_type": "security",
        "severity": "high",
        "description": "Security exclusion zone around Tartus naval facility",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [35.840, 34.920],
                [35.920, 34.920],
                [35.920, 34.880],
                [35.840, 34.880],
                [35.840, 34.920],
            ]]
        }
    },
    {
        "id": "gf-limassol-port",
        "name": "Limassol Port Zone",
        "zone_type": "restricted",
        "severity": "medium",
        "description": "Restricted zone around Limassol port and new container terminal",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [32.995, 34.670],
                [33.065, 34.670],
                [33.065, 34.630],
                [32.995, 34.630],
                [32.995, 34.670],
            ]]
        }
    },
]


# ── Track Generators ───────────────────────────────────

def generate_normal_track(
    start_lat: float, start_lon: float,
    heading: float, speed_knots: float,
    num_points: int = 50, interval_min: float = 2.5,
    jitter: float = 0.001
) -> list[dict]:
    """Generate a smooth normal vessel track."""
    positions = []
    lat, lon = start_lat, start_lon
    t = BASE_TIME
    for i in range(num_points):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-jitter/3, jitter/3),
            "longitude": lon + random.uniform(-jitter/3, jitter/3),
            "speed_over_ground": speed_knots + random.uniform(-0.5, 0.5),
            "course_over_ground": heading + random.uniform(-3, 3),
            "heading": heading + random.uniform(-2, 2),
        })
        # Advance position
        nm_per_min = speed_knots / 60
        dist = nm_per_min * interval_min
        lat += dist * math.cos(math.radians(heading)) / 60
        lon += dist * math.sin(math.radians(heading)) / (60 * math.cos(math.radians(lat)))
        t += timedelta(minutes=interval_min + random.uniform(-0.3, 0.3))
    return positions


def generate_suspicious_track() -> list[dict]:
    """Generate the MV DARK HORIZON suspicious track.

    Behavior: approaches from south, enters restricted terminal zone,
    loiters with erratic speed, has AIS gap, then resumes.
    """
    positions = []
    t = BASE_TIME

    # Phase 1: Normal approach from south (10 points)
    lat, lon = 33.690, -118.268
    for i in range(10):
        positions.append({
            "timestamp": t,
            "latitude": lat,
            "longitude": lon,
            "speed_over_ground": 8.0 + random.uniform(-0.5, 0.5),
            "course_over_ground": 5 + random.uniform(-3, 3),
            "heading": 5 + random.uniform(-2, 2),
        })
        lat += 0.003
        lon += random.uniform(-0.0005, 0.0005)
        t += timedelta(minutes=2.5)

    # Phase 2: AIS gap — 12 minutes with no reports (skip)
    t += timedelta(minutes=12)

    # Phase 3: Appears inside restricted terminal zone, loitering (20 points)
    lat, lon = 33.750, -118.267  # Inside restricted zone
    for i in range(20):
        # Erratic speed: alternating 0 and 5-8 knots
        if i % 3 == 0:
            speed = random.uniform(0, 0.3)
            heading_val = random.uniform(0, 360)
        else:
            speed = random.uniform(5, 8)
            heading_val = random.uniform(0, 360)

        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.002, 0.002),
            "longitude": lon + random.uniform(-0.002, 0.002),
            "speed_over_ground": speed,
            "course_over_ground": heading_val,
            "heading": heading_val,
        })
        t += timedelta(minutes=2.5)

    # Phase 4: Slow drift near security zone (15 points)
    lat, lon = 33.745, -118.235  # Near LNG security zone
    for i in range(15):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.003, 0.003),
            "longitude": lon + random.uniform(-0.003, 0.003),
            "speed_over_ground": random.uniform(0.5, 2.0),
            "course_over_ground": random.uniform(180, 270),
            "heading": random.uniform(180, 270),
        })
        t += timedelta(minutes=2.5)

    return positions


def generate_moderate_track_wanderer() -> list[dict]:
    """PACIFIC WANDERER: fishing vessel with unusual speed changes near port."""
    positions = []
    t = BASE_TIME + timedelta(minutes=10)
    lat, lon = 33.710, -118.280

    for i in range(45):
        if 15 < i < 25:
            # Speed anomaly phase
            speed = random.choice([0.2, 7.0, 0.5, 6.5, 0.3, 8.0])
            heading_val = random.uniform(0, 360)
        else:
            speed = 5.0 + random.uniform(-1, 1)
            heading_val = 45 + random.uniform(-10, 10)

        positions.append({
            "timestamp": t,
            "latitude": lat,
            "longitude": lon,
            "speed_over_ground": speed,
            "course_over_ground": heading_val,
            "heading": heading_val + random.uniform(-5, 5),
        })
        lat += 0.001 * math.cos(math.radians(heading_val))
        lon += 0.001 * math.sin(math.radians(heading_val)) / math.cos(math.radians(lat))
        t += timedelta(minutes=2.5)

    return positions


def generate_moderate_track_runner() -> list[dict]:
    """NIGHT RUNNER: pleasure craft near security zone at odd hours."""
    positions = []
    t = BASE_TIME + timedelta(minutes=5)
    lat, lon = 33.738, -118.242  # Near LNG security zone

    for i in range(40):
        # Slow circling near the security zone
        angle = (i * 15) % 360
        r = 0.004
        p_lat = lat + r * math.cos(math.radians(angle))
        p_lon = lon + r * math.sin(math.radians(angle))

        positions.append({
            "timestamp": t,
            "latitude": p_lat,
            "longitude": p_lon,
            "speed_over_ground": 3.0 + random.uniform(-0.5, 0.5),
            "course_over_ground": (angle + 90) % 360,
            "heading": (angle + 90) % 360,
        })
        t += timedelta(minutes=2.5)

    return positions


def generate_spoofing_track() -> list[dict]:
    """JADE STAR: impossible position jumps indicating AIS spoofing."""
    positions = []
    t = BASE_TIME + timedelta(minutes=15)

    # Phase 1: Normal approach from SSE (10 points at ~8kt)
    lat, lon = 33.680, -118.250
    for i in range(10):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0003, 0.0003),
            "longitude": lon + random.uniform(-0.0003, 0.0003),
            "speed_over_ground": 8.0 + random.uniform(-0.5, 0.5),
            "course_over_ground": 350 + random.uniform(-5, 5),
            "heading": 350 + random.uniform(-3, 3),
        })
        lat += 0.0025
        lon += random.uniform(-0.0003, 0.0003)
        t += timedelta(minutes=2.5)

    # Phase 2: IMPOSSIBLE JUMP — ~50nm north in 2 minutes
    t += timedelta(minutes=2)
    lat_jumped = lat + 0.83  # ~50nm
    positions.append({
        "timestamp": t,
        "latitude": lat_jumped,
        "longitude": lon + random.uniform(-0.001, 0.001),
        "speed_over_ground": 8.5,  # Reports normal speed — lying
        "course_over_ground": 355,
        "heading": 355,
    })

    # Phase 3: Normal segment from jumped position (5 points)
    lat = lat_jumped
    t += timedelta(minutes=2.5)
    for i in range(5):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0003, 0.0003),
            "longitude": lon + random.uniform(-0.0003, 0.0003),
            "speed_over_ground": 7.5 + random.uniform(-0.5, 0.5),
            "course_over_ground": 340 + random.uniform(-5, 5),
            "heading": 340 + random.uniform(-3, 3),
        })
        lat += 0.002
        t += timedelta(minutes=2.5)

    # Phase 4: SECOND IMPOSSIBLE JUMP — ~30nm back south in 3 minutes
    t += timedelta(minutes=3)
    lat_back = lat - 0.50  # ~30nm
    positions.append({
        "timestamp": t,
        "latitude": lat_back,
        "longitude": lon + 0.01,
        "speed_over_ground": 9.0,
        "course_over_ground": 175,
        "heading": 175,
    })

    # Phase 5: Brief normal segment (5 points)
    lat, lon = lat_back, lon + 0.01
    t += timedelta(minutes=2.5)
    for i in range(5):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0003, 0.0003),
            "longitude": lon + random.uniform(-0.0003, 0.0003),
            "speed_over_ground": 8.0 + random.uniform(-0.5, 0.5),
            "course_over_ground": 10 + random.uniform(-5, 5),
            "heading": 10 + random.uniform(-3, 3),
        })
        lat += 0.002
        t += timedelta(minutes=2.5)

    return positions


def generate_dark_optical_track() -> list[dict]:
    """UNIDENTIFIED VESSEL: CV-derived positions, slow ~4kt movement."""
    positions = []
    t = BASE_TIME + timedelta(minutes=45)
    lat, lon = 33.700, -118.250
    heading = 295  # WNW
    speed_kt = 4.2

    for i in range(6):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0002, 0.0002),
            "longitude": lon + random.uniform(-0.0002, 0.0002),
            "speed_over_ground": speed_kt + random.uniform(-0.3, 0.3),
            "course_over_ground": heading + random.uniform(-8, 8),
            "heading": heading + random.uniform(-5, 5),
        })
        nm_per_min = speed_kt / 60
        dist = nm_per_min * 5  # 5-min intervals
        lat += dist * math.cos(math.radians(heading)) / 60
        lon += dist * math.sin(math.radians(heading)) / (60 * math.cos(math.radians(lat)))
        t += timedelta(minutes=5)

    return positions


def generate_anchor_track(lat: float, lon: float, num_points: int = 40) -> list[dict]:
    """Stationary vessel at anchor with slight drift."""
    positions = []
    t = BASE_TIME
    for i in range(num_points):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0005, 0.0005),
            "longitude": lon + random.uniform(-0.0005, 0.0005),
            "speed_over_ground": random.uniform(0, 0.3),
            "course_over_ground": random.uniform(0, 360),
            "heading": random.uniform(0, 360),
        })
        t += timedelta(minutes=2.5)
    return positions


def generate_tug_track() -> list[dict]:
    """PORT VALOR: short movements near docks."""
    positions = []
    t = BASE_TIME + timedelta(minutes=5)
    lat, lon = 33.748, -118.275

    for i in range(35):
        angle = (i * 25 + random.uniform(-10, 10)) % 360
        speed = random.uniform(2, 6) if i % 5 != 0 else random.uniform(0, 0.5)
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.001, 0.001),
            "longitude": lon + random.uniform(-0.001, 0.001),
            "speed_over_ground": speed,
            "course_over_ground": angle,
            "heading": angle + random.uniform(-10, 10),
        })
        lat += 0.0003 * math.cos(math.radians(angle))
        lon += 0.0003 * math.sin(math.radians(angle)) / math.cos(math.radians(lat))
        lat = max(33.744, min(33.752, lat))
        lon = max(-118.280, min(-118.270, lon))
        t += timedelta(minutes=2.5)

    return positions


def seed():
    """Main seed function."""
    # Reset database
    Base.metadata.drop_all(bind=engine)
    init_db()

    db = SessionLocal()

    try:
        # Create geofences
        for gf_data in GEOFENCES:
            gf = GeofenceORM(
                id=gf_data["id"],
                name=gf_data["name"],
                zone_type=gf_data["zone_type"],
                severity=gf_data["severity"],
                description=gf_data["description"],
                geometry_json=json.dumps(gf_data["geometry"]),
            )
            db.add(gf)

        # Create vessels and tracks
        track_generators = {
            "v-dark-horizon": generate_suspicious_track,
            "v-jade-star": generate_spoofing_track,
            "v-dark-optical-1": generate_dark_optical_track,
            "v-port-valor": generate_tug_track,
            "v-pacific-guardian": lambda: generate_anchor_track(33.712, -118.218),
        }
        normal_configs = {
            "v-ever-forward": (33.690, -118.260, 5, 12),
            "v-maria-del-mar": (33.680, -118.300, 315, 4),
            "v-catalina-express": (33.740, -118.280, 210, 22),
        }

        for vessel_data in VESSELS:
            vessel = VesselORM(
                id=vessel_data["id"],
                mmsi=vessel_data["mmsi"],
                name=vessel_data["name"],
                vessel_type=vessel_data["vessel_type"],
                flag_state=vessel_data["flag_state"],
                length=vessel_data.get("length"),
                beam=vessel_data.get("beam"),
                draft=vessel_data.get("draft"),
                imo=vessel_data.get("imo"),
                callsign=vessel_data.get("callsign"),
                destination=vessel_data.get("destination"),
                region="la_harbor",
                inspection_deficiencies=vessel_data.get("inspection_deficiencies", 0),
                last_inspection_date=vessel_data.get("last_inspection_date"),
            )
            db.add(vessel)

            # Generate track
            vid = vessel_data["id"]
            if vid in track_generators:
                positions = track_generators[vid]()
            elif vid in normal_configs:
                lat, lon, hdg, spd = normal_configs[vid]
                positions = generate_normal_track(lat, lon, hdg, spd)
            else:
                positions = generate_normal_track(33.710, -118.260, 0, 5)

            for pos in positions:
                pr = PositionReportORM(
                    vessel_id=vid,
                    timestamp=pos["timestamp"],
                    latitude=pos["latitude"],
                    longitude=pos["longitude"],
                    speed_over_ground=pos["speed_over_ground"],
                    course_over_ground=pos["course_over_ground"],
                    heading=pos["heading"],
                )
                db.add(pr)

        db.commit()

        # Generate alerts from anomaly detection
        print("Running anomaly detection and generating alerts...")
        alerts = generate_alerts_for_all_vessels(db)
        print(f"Created {len(alerts)} alerts from auto-detection")

        # ── Manual alerts for demo-specific vessels ────────────
        # Dark optical vessel — needs a dark_ship_optical signal
        # (not generated by standard anomaly pipeline)
        for ea in db.query(AlertORM).filter(AlertORM.vessel_id == "v-dark-optical-1").all():
            db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == ea.id).delete()
            db.delete(ea)

        dark_optical_alert_id = str(uuid.uuid4())
        dark_optical_signals = [{
            "anomaly_type": "dark_ship_optical",
            "severity": 0.65,
            "description": (
                "OPTICAL DARK SHIP DETECTION by SeaPod_Alpha. "
                "Unregistered vessel detected at range 3.3 nm, bearing 295\u00b0. "
                "No AIS transponder signal. Detection confidence: 50%. "
                "This vessel does not appear in any AIS database."
            ),
            "details": {
                "source": "edge_node",
                "node_id": "SeaPod_Alpha",
                "raw_distance_m": 6112.0,
                "scaled_distance_nm": 3.3,
                "velocity_ms": 4.2,
                "heading_deg": 295,
                "confidence": 0.50,
                "stream_url": None,
            },
        }]
        dark_optical_alert = AlertORM(
            id=dark_optical_alert_id,
            vessel_id="v-dark-optical-1",
            risk_score=85.0,
            recommended_action="escalate",
            explanation=(
                "Unidentified vessel detected by optical computer vision (SeaPod edge node). "
                "No AIS transponder, no registered identity. "
                "Detected at 3.3 nm range, bearing 295\u00b0, moving at ~4.2 kt."
            ),
            anomaly_signals_json=json.dumps(dark_optical_signals),
        )
        db.add(dark_optical_alert)
        for sig in dark_optical_signals:
            db.add(AnomalySignalORM(
                alert_id=dark_optical_alert_id,
                anomaly_type=sig["anomaly_type"],
                severity=sig["severity"],
                description=sig["description"],
                details_json=json.dumps(sig["details"]),
            ))
        alerts.append(dark_optical_alert)

        # JADE STAR — ensure a compelling spoofing alert exists
        for ea in db.query(AlertORM).filter(AlertORM.vessel_id == "v-jade-star").all():
            db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == ea.id).delete()
            db.delete(ea)

        jade_star_alert_id = str(uuid.uuid4())
        jade_star_signals = [{
            "anomaly_type": "kinematic_implausibility",
            "severity": 0.55,
            "description": (
                "2 impossible position jumps detected (max 50.0 nm in under 2 minutes). "
                "Vessel appeared to teleport between locations — strong indicator of "
                "AIS position spoofing or GPS manipulation."
            ),
            "details": {
                "impossible_jumps": 2,
                "max_jump_nm": 50.0,
                "max_implied_speed_kt": 1500.0,
                "spoofing_confidence": "high",
            },
        }]
        jade_star_alert = AlertORM(
            id=jade_star_alert_id,
            vessel_id="v-jade-star",
            risk_score=72.0,
            recommended_action="verify",
            explanation=(
                "AIS position data shows kinematic implausibility — "
                "2 position jumps exceeding physically possible vessel speed. "
                "Probable AIS spoofing or GPS manipulation. Verify actual position."
            ),
            anomaly_signals_json=json.dumps(jade_star_signals),
        )
        db.add(jade_star_alert)
        for sig in jade_star_signals:
            db.add(AnomalySignalORM(
                alert_id=jade_star_alert_id,
                anomaly_type=sig["anomaly_type"],
                severity=sig["severity"],
                description=sig["description"],
                details_json=json.dumps(sig["details"]),
            ))
        alerts.append(jade_star_alert)
        db.commit()
        print(f"  + 2 manual demo alerts (dark optical, spoofing)")

        # Seed risk history for sparkline visualization (simulate 3 hours of trend data)
        print("Seeding risk history for sparkline trends...")
        now = datetime.utcnow()
        for alert in alerts:
            base_score = alert.risk_score
            # Create ~12 data points over the past 3 hours (every ~15 min)
            for i in range(12):
                minutes_ago = (12 - i) * 15
                # Simulate escalation: score ramps up toward current value
                progress = (i + 1) / 12
                noise = random.uniform(-3, 3)
                # Start at 40-60% of current score and ramp up
                score = max(0, min(100, base_score * (0.4 + 0.6 * progress) + noise))
                db.add(RiskHistoryORM(
                    vessel_id=alert.vessel_id,
                    risk_score=round(score, 1),
                    recommended_action=alert.recommended_action,
                    timestamp=now - timedelta(minutes=minutes_ago),
                ))
        db.commit()
        history_count = db.query(RiskHistoryORM).count()
        print(f"  Risk history points: {history_count}")

        # Print summary
        vessels_count = db.query(VesselORM).count()
        positions_count = db.query(PositionReportORM).count()
        geofences_count = db.query(GeofenceORM).count()
        alerts_count = db.query(AlertORM).count()

        print(f"\nSeed complete:")
        print(f"  Vessels:    {vessels_count}")
        print(f"  Positions:  {positions_count}")
        print(f"  Geofences:  {geofences_count}")
        print(f"  Alerts:     {alerts_count}")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
