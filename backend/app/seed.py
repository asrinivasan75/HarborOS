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
    AlertORM, AnomalySignalORM
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
        "name": "EventEdgeHQ.com",
        "vessel_type": "cargo",
        "flag_state": "Marshall Islands",
        "length": 89.0, "beam": 14.0, "draft": 5.2,
        "imo": None,  # Missing — suspicious
        "callsign": None,  # Missing — suspicious
        "destination": "UNKNOWN",
        "inspection_deficiencies": 4,
        "last_inspection_date": "2025-06-15",
    },
    # MODERATE SUSPICION
    {
        "id": "v-pacific-wanderer",
        "mmsi": "412345678",
        "name": "PACIFIC WANDERER",
        "vessel_type": "fishing",
        "flag_state": "China",
        "length": 45.0, "beam": 8.0, "draft": 3.5,
        "imo": "9876543",
        "callsign": "BXYZ",
        "destination": "LA HARBOR",
        "inspection_deficiencies": 2,
        "last_inspection_date": "2025-11-20",
    },
    {
        "id": "v-night-runner",
        "mmsi": "367890123",
        "name": "NIGHT RUNNER",
        "vessel_type": "pleasure",
        "flag_state": "United States",
        "length": 18.0, "beam": 5.0, "draft": 1.8,
        "imo": None,
        "callsign": "WXY4567",
        "destination": None,
        "inspection_deficiencies": 0,
        "last_inspection_date": None,
    },
    # NORMAL TRAFFIC
    {
        "id": "v-maersk-sealand",
        "mmsi": "220417000",
        "name": "MAERSK SEALAND",
        "vessel_type": "cargo",
        "flag_state": "Denmark",
        "length": 294.0, "beam": 32.0, "draft": 13.5,
        "imo": "9778791",
        "callsign": "OZCU2",
        "destination": "LOS ANGELES",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2025-09-10",
    },
    {
        "id": "v-pacific-voyager",
        "mmsi": "477123456",
        "name": "PACIFIC VOYAGER",
        "vessel_type": "tanker",
        "flag_state": "Hong Kong",
        "length": 228.0, "beam": 32.0, "draft": 12.1,
        "imo": "9654321",
        "callsign": "VRBC5",
        "destination": "LONG BEACH",
        "inspection_deficiencies": 1,
        "last_inspection_date": "2025-08-05",
    },
    {
        "id": "v-harbor-pilot-1",
        "mmsi": "367111222",
        "name": "HARBOR PILOT 1",
        "vessel_type": "tug",
        "flag_state": "United States",
        "length": 22.0, "beam": 8.0, "draft": 3.0,
        "imo": None,
        "callsign": "WDD9876",
        "destination": "LA HARBOR",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2026-01-15",
    },
    {
        "id": "v-cosco-harmony",
        "mmsi": "477234567",
        "name": "COSCO HARMONY",
        "vessel_type": "cargo",
        "flag_state": "Hong Kong",
        "length": 366.0, "beam": 51.0, "draft": 15.5,
        "imo": "9785432",
        "callsign": "VRDE7",
        "destination": "LOS ANGELES",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2025-10-22",
    },
    {
        "id": "v-island-princess",
        "mmsi": "311234567",
        "name": "ISLAND PRINCESS",
        "vessel_type": "passenger",
        "flag_state": "Bermuda",
        "length": 294.0, "beam": 32.0, "draft": 8.0,
        "imo": "9123456",
        "callsign": "ZCBP",
        "destination": "LOS ANGELES",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2025-12-01",
    },
    {
        "id": "v-tug-resolve",
        "mmsi": "367222333",
        "name": "TUG RESOLVE",
        "vessel_type": "tug",
        "flag_state": "United States",
        "length": 30.0, "beam": 10.0, "draft": 4.0,
        "imo": None,
        "callsign": "WDE1234",
        "destination": "LA HARBOR",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2026-02-10",
    },
    {
        "id": "v-ever-fortune",
        "mmsi": "416789012",
        "name": "EVER FORTUNE",
        "vessel_type": "cargo",
        "flag_state": "Taiwan",
        "length": 335.0, "beam": 45.8, "draft": 14.2,
        "imo": "9811234",
        "callsign": "BIJK",
        "destination": "LOS ANGELES",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2025-07-18",
    },
    {
        "id": "v-sea-breeze",
        "mmsi": "367333444",
        "name": "SEA BREEZE",
        "vessel_type": "pleasure",
        "flag_state": "United States",
        "length": 12.0, "beam": 4.0, "draft": 1.5,
        "imo": None,
        "callsign": "WXF7890",
        "destination": None,
        "inspection_deficiencies": 0,
        "last_inspection_date": None,
    },
    {
        "id": "v-blue-marlin",
        "mmsi": "367444555",
        "name": "BLUE MARLIN",
        "vessel_type": "fishing",
        "flag_state": "United States",
        "length": 20.0, "beam": 6.0, "draft": 2.5,
        "imo": None,
        "callsign": "WBM2345",
        "destination": "FISHING GROUNDS",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2025-05-01",
    },
    {
        "id": "v-yang-ming-unity",
        "mmsi": "416890123",
        "name": "YANG MING UNITY",
        "vessel_type": "cargo",
        "flag_state": "Taiwan",
        "length": 304.0, "beam": 40.0, "draft": 13.0,
        "imo": "9756789",
        "callsign": "BILM",
        "destination": "LONG BEACH",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2025-11-01",
    },
    {
        "id": "v-uscg-cutter",
        "mmsi": "338123456",
        "name": "USCG STEADFAST",
        "vessel_type": "law_enforcement",
        "flag_state": "United States",
        "length": 64.0, "beam": 10.0, "draft": 3.2,
        "imo": None,
        "callsign": "NRCS",
        "destination": "PATROL",
        "inspection_deficiencies": 0,
        "last_inspection_date": None,
    },
    {
        "id": "v-bunker-barge",
        "mmsi": "367555666",
        "name": "FUEL BARGE 12",
        "vessel_type": "tanker",
        "flag_state": "United States",
        "length": 60.0, "beam": 15.0, "draft": 4.0,
        "imo": None,
        "callsign": "WFB1200",
        "destination": "ANCHORAGE",
        "inspection_deficiencies": 0,
        "last_inspection_date": "2026-01-20",
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
            "v-pacific-wanderer": generate_moderate_track_wanderer,
            "v-night-runner": generate_moderate_track_runner,
        }

        # Normal vessel track configs (start_lat, start_lon, heading, speed_knots)
        # Keep speeds low so vessels stay within the harbor area over 2hrs
        normal_configs = {
            "v-maersk-sealand": (33.705, -118.260, 10, 3),     # Inbound cargo, slow approach
            "v-pacific-voyager": (33.708, -118.245, 350, 2.5),  # Tanker heading to berth
            "v-harbor-pilot-1": (33.730, -118.268, 180, 4),     # Pilot boat cruising harbor
            "v-cosco-harmony": (33.700, -118.255, 15, 3),       # Large cargo inbound
            "v-island-princess": (33.698, -118.275, 20, 4),     # Cruise ship approach
            "v-tug-resolve": (33.740, -118.262, 225, 3),        # Tug working harbor
            "v-ever-fortune": (33.702, -118.270, 5, 2.5),       # Cargo at channel entrance
            "v-sea-breeze": (33.722, -118.280, 135, 2),         # Pleasure craft
            "v-blue-marlin": (33.710, -118.290, 90, 2),         # Fishing vessel
            "v-yang-ming-unity": (33.704, -118.248, 10, 3),     # Cargo inbound
            "v-uscg-cutter": (33.725, -118.255, 270, 5),        # Coast guard patrol
            "v-bunker-barge": (33.715, -118.230, 180, 1),       # Barge, barely moving
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
        print(f"Created {len(alerts)} alerts")

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
