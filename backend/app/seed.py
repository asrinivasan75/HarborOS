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
    VerificationRequestORM,
)
from app.services.alert_service import generate_alerts_for_all_vessels

# LA Harbor center: ~33.735N, 118.265W
CENTER_LAT = 33.735
CENTER_LON = -118.265
BASE_TIME = datetime.utcnow() - timedelta(hours=2)  # Always 2h ago so detect_dark_vessel doesn't false-positive


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

    # ── Moderate suspicion ─────────────────────────────

    # Zone lingerer — tanker drifting near LNG security zone
    {
        "id": "v-aegean-voyager",
        "mmsi": "241234567",
        "name": "AEGEAN VOYAGER",
        "vessel_type": "tanker",
        "flag_state": "Greece",
        "length": 174.0, "beam": 28.0, "draft": 10.5,
        "imo": "9812345",
        "callsign": "SV2AEG",
        "destination": "LONG BEACH",
        "inspection_deficiencies": 1,
    },

    # Erratic fishing vessel — speed anomalies + heading changes near restricted zone
    {
        "id": "v-ocean-phantom",
        "mmsi": "416789012",
        "name": "OCEAN PHANTOM",
        "vessel_type": "fishing",
        "flag_state": "Taiwan",
        "length": 35.0, "beam": 8.0, "draft": 3.2,
        "imo": None,
        "callsign": None,
        "destination": "UNKNOWN",
        "inspection_deficiencies": 3,
    },

    # Cargo with AIS gap + unusual speed profile
    {
        "id": "v-northern-spirit",
        "mmsi": "636098765",
        "name": "NORTHERN SPIRIT",
        "vessel_type": "cargo",
        "flag_state": "Liberia",
        "length": 145.0, "beam": 22.0, "draft": 8.4,
        "imo": "9654321",
        "callsign": "A8NS9",
        "destination": "SAN PEDRO",
        "inspection_deficiencies": 2,
    },

    # Tanker loitering in anchorage with no destination
    {
        "id": "v-caspian-trader",
        "mmsi": "256345678",
        "name": "CASPIAN TRADER",
        "vessel_type": "tanker",
        "flag_state": "Malta",
        "length": 130.0, "beam": 20.0, "draft": 7.8,
        "imo": "9543210",
        "callsign": None,
        "destination": "UNKNOWN",
        "inspection_deficiencies": 2,
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
    """Generate the MV DARK HORIZON suspicious track — dense, multi-phase.

    ~120 position points across 7 phases:
    1. Normal approach from south (15 pts)
    2. Sudden deceleration + course change (8 pts)
    3. AIS gap — 18 minutes silence
    4. Reappears inside restricted terminal zone, loitering (25 pts)
    5. High-speed sprint toward LNG security zone (10 pts)
    6. Slow circling / dead-in-water near LNG zone (20 pts)
    7. Erratic drift toward environmental preserve (15 pts)
    8. Second AIS gap — 8 minutes
    9. Final position cluster near anchorage (12 pts)
    """
    positions = []
    t = BASE_TIME

    # Phase 1: Normal approach from south at ~8 kt (15 points, 2 min intervals)
    lat, lon = 33.680, -118.270
    for i in range(15):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0003, 0.0003),
            "longitude": lon + random.uniform(-0.0003, 0.0003),
            "speed_over_ground": 8.2 + random.uniform(-0.4, 0.4),
            "course_over_ground": 8 + random.uniform(-3, 3),
            "heading": 8 + random.uniform(-2, 2),
        })
        lat += 0.0028
        lon += random.uniform(-0.0004, 0.0004)
        t += timedelta(minutes=2)

    # Phase 2: Sudden deceleration + erratic course change (8 points)
    for i in range(8):
        speed = max(0.2, 8.0 - i * 1.1 + random.uniform(-0.3, 0.3))
        heading_val = 8 + i * 25 + random.uniform(-10, 10)  # veering hard
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.001, 0.001),
            "longitude": lon + random.uniform(-0.001, 0.001),
            "speed_over_ground": speed,
            "course_over_ground": heading_val % 360,
            "heading": (heading_val + random.uniform(-8, 8)) % 360,
        })
        lat += 0.0008 * math.cos(math.radians(heading_val))
        lon += 0.0008 * math.sin(math.radians(heading_val)) / math.cos(math.radians(lat))
        t += timedelta(minutes=2)

    # Phase 3: AIS gap — 18 minutes with no reports
    t += timedelta(minutes=18)

    # Phase 4: Reappears inside restricted terminal zone, loitering (25 points)
    lat, lon = 33.750, -118.267  # Inside APM Terminal Restricted Zone
    for i in range(25):
        if i % 4 == 0:
            speed = random.uniform(0, 0.3)  # Dead stop
            heading_val = random.uniform(0, 360)
        elif i % 4 == 1:
            speed = random.uniform(5.5, 8.0)  # Sudden burst
            heading_val = random.uniform(0, 360)
        else:
            speed = random.uniform(1.5, 3.5)  # Slow creep
            heading_val = random.uniform(0, 360)

        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.002, 0.002),
            "longitude": lon + random.uniform(-0.002, 0.002),
            "speed_over_ground": speed,
            "course_over_ground": heading_val,
            "heading": heading_val + random.uniform(-5, 5),
        })
        t += timedelta(minutes=2)

    # Phase 5: High-speed sprint east toward LNG security zone (10 points)
    lat, lon = 33.748, -118.260
    heading_base = 95  # East
    for i in range(10):
        speed = 14.0 + random.uniform(-1, 2)  # Unusually fast for this area
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.0005, 0.0005),
            "longitude": lon + random.uniform(-0.0005, 0.0005),
            "speed_over_ground": speed,
            "course_over_ground": heading_base + random.uniform(-4, 4),
            "heading": heading_base + random.uniform(-3, 3),
        })
        nm_per_min = speed / 60
        dist = nm_per_min * 1.5
        lat += dist * math.cos(math.radians(heading_base)) / 60
        lon += dist * math.sin(math.radians(heading_base)) / (60 * math.cos(math.radians(lat)))
        t += timedelta(minutes=1.5)

    # Phase 6: Slow circling near LNG security zone (20 points)
    center_lat, center_lon = 33.745, -118.235
    for i in range(20):
        angle = (i * 18 + random.uniform(-8, 8)) % 360
        r = 0.003 + random.uniform(-0.001, 0.001)
        p_lat = center_lat + r * math.cos(math.radians(angle))
        p_lon = center_lon + r * math.sin(math.radians(angle)) / math.cos(math.radians(center_lat))

        speed = random.uniform(0.2, 2.5) if i % 5 != 0 else 0.0  # periodic dead stop
        positions.append({
            "timestamp": t,
            "latitude": p_lat,
            "longitude": p_lon,
            "speed_over_ground": speed,
            "course_over_ground": (angle + 90) % 360,
            "heading": (angle + 90 + random.uniform(-10, 10)) % 360,
        })
        t += timedelta(minutes=2.5)

    # Phase 7: Erratic drift toward environmental preserve (15 points)
    lat, lon = 33.740, -118.250
    for i in range(15):
        heading_val = 250 + random.uniform(-40, 40)  # SW-ish, erratic
        speed = random.uniform(0.5, 4.0)
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.002, 0.002),
            "longitude": lon + random.uniform(-0.002, 0.002),
            "speed_over_ground": speed,
            "course_over_ground": heading_val % 360,
            "heading": (heading_val + random.uniform(-15, 15)) % 360,
        })
        lat += 0.0005 * math.cos(math.radians(heading_val))
        lon += 0.0005 * math.sin(math.radians(heading_val)) / math.cos(math.radians(lat))
        t += timedelta(minutes=2)

    # Phase 8: Second AIS gap — 8 minutes
    t += timedelta(minutes=8)

    # Phase 9: Final position cluster near anchorage (12 points)
    lat, lon = 33.712, -118.220  # Near Anchorage A
    for i in range(12):
        positions.append({
            "timestamp": t,
            "latitude": lat + random.uniform(-0.001, 0.001),
            "longitude": lon + random.uniform(-0.001, 0.001),
            "speed_over_ground": random.uniform(0, 0.5),
            "course_over_ground": random.uniform(0, 360),
            "heading": random.uniform(0, 360),
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

        # MV DARK HORIZON — the demo star, loaded with signals
        for ea in db.query(AlertORM).filter(AlertORM.vessel_id == "v-dark-horizon").all():
            db.query(AnomalySignalORM).filter(AnomalySignalORM.alert_id == ea.id).delete()
            db.delete(ea)

        dark_horizon_alert_id = str(uuid.uuid4())
        dark_horizon_signals = [
            {
                "anomaly_type": "ais_gap",
                "severity": 0.88,
                "description": (
                    "Two AIS transmission gaps detected: 18 minutes (08:46–09:04 UTC) and "
                    "8 minutes (11:22–11:30 UTC). Vessel reappeared 2.1 nm from last known "
                    "position after first gap — inside APM Terminal Restricted Zone. "
                    "Gap duration and positional displacement exceed normal equipment failure patterns."
                ),
                "details": {
                    "gaps": [
                        {"start": "2026-03-27T08:46:00Z", "end": "2026-03-27T09:04:00Z", "duration_min": 18, "displacement_nm": 2.1},
                        {"start": "2026-03-27T11:22:00Z", "end": "2026-03-27T11:30:00Z", "duration_min": 8, "displacement_nm": 0.8},
                    ],
                    "total_gaps": 2,
                    "max_gap_min": 18,
                    "intentional_confidence": "high",
                },
            },
            {
                "anomaly_type": "geofence_breach",
                "severity": 0.92,
                "description": (
                    "Vessel entered APM Terminal Restricted Zone (gf-restricted-terminal) at 09:04 UTC "
                    "and remained inside for approximately 50 minutes with loitering behavior. "
                    "No port authority clearance on file. Additionally approached within 0.3 nm of "
                    "LNG Terminal Security Zone perimeter at 10:18 UTC."
                ),
                "details": {
                    "breached_zones": [
                        {"zone_id": "gf-restricted-terminal", "zone_name": "APM Terminal Restricted Zone", "severity": "high", "duration_min": 50},
                        {"zone_id": "gf-security-zone-lng", "zone_name": "LNG Terminal Security Zone", "severity": "high", "approach_nm": 0.3},
                    ],
                    "clearance_verified": False,
                },
            },
            {
                "anomaly_type": "loitering",
                "severity": 0.70,
                "description": (
                    "Loitering detected in restricted terminal zone: 25 position reports "
                    "over 50 minutes within a 0.4 nm radius. Speed oscillated between 0–8 kt with "
                    "no consistent heading — inconsistent with cargo operations or anchorage waiting."
                ),
                "details": {
                    "duration_min": 50,
                    "radius_nm": 0.4,
                    "position_count": 25,
                    "avg_speed_kt": 2.3,
                    "speed_variance": 6.8,
                    "heading_variance_deg": 142,
                },
            },
            {
                "anomaly_type": "route_deviation",
                "severity": 0.55,
                "description": (
                    "Vessel declared destination 'UNKNOWN' with no filed voyage plan. Track shows "
                    "low correlation with standard LA Harbor approach routes. Course changed >90° "
                    "on 4 occasions."
                ),
                "details": {
                    "declared_destination": "UNKNOWN",
                    "voyage_plan_filed": False,
                    "course_changes_over_90deg": 4,
                    "route_correlation_pct": 18,
                },
            },
            {
                "anomaly_type": "type_mismatch",
                "severity": 0.85,
                "description": (
                    "Multiple identity red flags: IMO number missing (required for cargo vessels "
                    ">300 GT), callsign not registered, flag state (Marshall Islands) on enhanced "
                    "monitoring list. 4 inspection deficiencies from last PSC inspection (Jun 2025). "
                    "MMSI 538006789 has no prior port calls in USCG database."
                ),
                "details": {
                    "missing_imo": True,
                    "missing_callsign": True,
                    "flag_state_risk": "elevated",
                    "inspection_deficiencies": 4,
                    "prior_port_calls": 0,
                    "psc_detention_history": "unknown",
                },
            },
            {
                "anomaly_type": "zone_lingering",
                "severity": 0.78,
                "description": (
                    "Vessel lingered within 0.3 nm of LNG Terminal Security Zone for 50 minutes. "
                    "Repeated slow passes along the perimeter suggest deliberate reconnaissance. "
                    "Speed dropped to 0 kt on 4 occasions while oriented toward the terminal."
                ),
                "details": {
                    "zone_id": "gf-security-zone-lng",
                    "zone_name": "LNG Terminal Security Zone",
                    "linger_duration_min": 50,
                    "min_distance_nm": 0.3,
                    "dead_stops": 4,
                    "perimeter_passes": 6,
                },
            },
            {
                "anomaly_type": "speed_anomaly",
                "severity": 0.62,
                "description": (
                    "Abnormal speed profile: vessel accelerated to 14+ kt in restricted harbor zone "
                    "(speed limit 8 kt) during sprint toward LNG terminal, then decelerated to "
                    "near-zero within 3 minutes. Speed variance across track is 6.8 kt — "
                    "3.2x the regional average for cargo vessels."
                ),
                "details": {
                    "max_speed_kt": 15.2,
                    "zone_speed_limit_kt": 8,
                    "speed_variance_kt": 6.8,
                    "regional_avg_variance_kt": 2.1,
                    "rapid_decel_events": 3,
                },
            },
        ]

        dark_horizon_alert = AlertORM(
            id=dark_horizon_alert_id,
            vessel_id="v-dark-horizon",
            risk_score=100.0,
            recommended_action="escalate",
            explanation=(
                "MV DARK HORIZON exhibits 7 anomaly signals across identity, spatial, and behavioral "
                "dimensions. Vessel went dark twice before appearing inside APM Terminal Restricted Zone "
                "with sustained loitering. Sprinted at 14+ kt toward LNG terminal then lingered along "
                "its perimeter. No IMO, no callsign, no voyage plan, Marshall Islands flag. "
                "Recommend immediate USCG verification and potential boarding."
            ),
            anomaly_signals_json=json.dumps(dark_horizon_signals),
        )
        db.add(dark_horizon_alert)
        for sig in dark_horizon_signals:
            db.add(AnomalySignalORM(
                alert_id=dark_horizon_alert_id,
                anomaly_type=sig["anomaly_type"],
                severity=sig["severity"],
                description=sig["description"],
                details_json=json.dumps(sig["details"]),
            ))
        alerts.append(dark_horizon_alert)

        # Satellite verification for Dark Horizon
        dh_vr_id = str(uuid.uuid4())
        dh_vr = VerificationRequestORM(
            id=dh_vr_id,
            alert_id=dark_horizon_alert_id,
            vessel_id="v-dark-horizon",
            status="completed",
            asset_type="satellite",
            asset_id="SENTINEL-2A",
            created_at=BASE_TIME + timedelta(hours=2),
            updated_at=BASE_TIME + timedelta(hours=2, minutes=3),
            result_confidence=0.67,
            result_notes=None,
            result_media_ref=f"/api/satellite/verification-image/{dh_vr_id}?bbox=-118.275,33.705,-118.225,33.755",
            satellite_source="copernicus",
            catalog_status="hit",
            request_lat=33.745,
            request_lng=-118.235,
            bbox_west=-118.275,
            bbox_south=33.705,
            bbox_east=-118.225,
            bbox_north=33.755,
            search_spread_deg=0.05,
            search_days_back=5,
            search_max_cloud_cover=30.0,
            scene_acquired_at=BASE_TIME - timedelta(hours=6),
            scene_satellite="Sentinel-2A",
            scene_resolution_m=10.0,
            scene_cloud_cover_pct=12.3,
            scene_status="delivered",
            scene_catalog_id="S2A_MSIL2A_20260327T020000_LA_HARBOR",
            scene_note=None,
        )
        db.add(dh_vr)

        db.commit()
        print(f"  + 3 manual demo alerts (dark horizon, dark optical, spoofing)")
        print(f"  + 1 satellite verification request (dark horizon)")

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
