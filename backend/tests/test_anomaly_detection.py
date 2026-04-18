"""Tests for anomaly detection heuristics."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
from app.models.domain import AnomalyType
from app.services.anomaly_detection import (
    detect_geofence_breach,
    detect_loitering,
    detect_speed_anomaly,
    detect_ais_gap,
    haversine_distance,
    point_in_polygon,
)


class FakeVessel:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class FakePosition:
    def __init__(self, lat, lon, timestamp, sog=5.0, cog=90.0, heading=90.0):
        self.latitude = lat
        self.longitude = lon
        self.timestamp = timestamp
        self.speed_over_ground = sog
        self.course_over_ground = cog
        self.heading = heading


class FakeGeofence:
    def __init__(self, id, name, zone_type, severity, geometry_json):
        self.id = id
        self.name = name
        self.zone_type = zone_type
        self.severity = severity
        self.geometry_json = geometry_json


def test_haversine_distance():
    # LA to Long Beach ~ a few nm
    d = haversine_distance(33.735, -118.265, 33.770, -118.189)
    assert 3 < d < 5, f"Expected ~4nm, got {d}"


def test_point_in_polygon():
    polygon = [[-118.3, 33.7], [-118.2, 33.7], [-118.2, 33.8], [-118.3, 33.8], [-118.3, 33.7]]
    assert point_in_polygon(33.75, -118.25, polygon)
    assert not point_in_polygon(33.5, -118.25, polygon)


def test_geofence_breach_detected():
    import json
    vessel = FakeVessel(id="v1", name="Test")
    # Position inside a restricted zone
    positions = [
        FakePosition(33.750, -118.267, datetime(2026, 1, 1, 8, 0))
    ]
    geofence = FakeGeofence(
        id="gf1", name="Test Zone", zone_type="restricted", severity="high",
        geometry_json=json.dumps({
            "type": "Polygon",
            "coordinates": [[[-118.272, 33.748], [-118.262, 33.748],
                             [-118.262, 33.755], [-118.272, 33.755], [-118.272, 33.748]]]
        })
    )
    signals = detect_geofence_breach(vessel, positions, [geofence])
    assert len(signals) == 1
    assert signals[0].anomaly_type == AnomalyType.GEOFENCE_BREACH
    assert signals[0].severity == 0.9


def test_geofence_no_breach():
    import json
    vessel = FakeVessel(id="v1", name="Test")
    positions = [
        FakePosition(33.700, -118.300, datetime(2026, 1, 1, 8, 0))
    ]
    geofence = FakeGeofence(
        id="gf1", name="Test Zone", zone_type="restricted", severity="high",
        geometry_json=json.dumps({
            "type": "Polygon",
            "coordinates": [[[-118.272, 33.748], [-118.262, 33.748],
                             [-118.262, 33.755], [-118.272, 33.755], [-118.272, 33.748]]]
        })
    )
    signals = detect_geofence_breach(vessel, positions, [geofence])
    assert len(signals) == 0


def test_loitering_detected():
    vessel = FakeVessel(id="v1", name="Test")
    base_time = datetime(2026, 1, 1, 8, 0)
    # 20 positions, all at near-zero speed in same spot
    positions = [
        FakePosition(33.750 + i * 0.0001, -118.267, base_time + timedelta(minutes=i * 3), sog=0.2)
        for i in range(20)
    ]
    signals = detect_loitering(vessel, positions)
    assert len(signals) == 1
    assert signals[0].anomaly_type == AnomalyType.LOITERING


def test_speed_anomaly_detected():
    vessel = FakeVessel(id="v1", name="Test")
    base_time = datetime(2026, 1, 1, 8, 0)
    speeds = [0.5, 8.0, 0.3, 7.5, 0.2, 8.5, 5.0, 0.1, 7.0, 0.5]
    positions = [
        FakePosition(33.75, -118.267, base_time + timedelta(minutes=i * 3), sog=s)
        for i, s in enumerate(speeds)
    ]
    signals = detect_speed_anomaly(vessel, positions)
    assert len(signals) == 1
    assert signals[0].anomaly_type == AnomalyType.SPEED_ANOMALY


def test_ais_gap_detected():
    vessel = FakeVessel(id="v1", name="Test")
    base_time = datetime(2026, 1, 1, 8, 0)
    positions = [
        FakePosition(33.75, -118.267, base_time),
        FakePosition(33.75, -118.267, base_time + timedelta(minutes=15)),  # 15 min gap
        FakePosition(33.75, -118.267, base_time + timedelta(minutes=18)),
    ]
    signals = detect_ais_gap(vessel, positions)
    assert len(signals) == 1
    assert signals[0].anomaly_type == AnomalyType.AIS_GAP


def test_no_anomalies_for_normal_vessel():
    vessel = FakeVessel(id="v1", name="Test")
    base_time = datetime(2026, 1, 1, 8, 0)
    # Normal transit: steady speed, consistent heading, no gaps
    positions = [
        FakePosition(
            33.70 + i * 0.002, -118.267,
            base_time + timedelta(minutes=i * 2.5),
            sog=8.0, cog=10.0, heading=10.0
        )
        for i in range(20)
    ]
    signals_loiter = detect_loitering(vessel, positions)
    signals_speed = detect_speed_anomaly(vessel, positions)
    signals_gap = detect_ais_gap(vessel, positions)
    assert len(signals_loiter) == 0
    assert len(signals_speed) == 0
    assert len(signals_gap) == 0


if __name__ == "__main__":
    tests = [
        test_haversine_distance,
        test_point_in_polygon,
        test_geofence_breach_detected,
        test_geofence_no_breach,
        test_loitering_detected,
        test_speed_anomaly_detected,
        test_ais_gap_detected,
        test_no_anomalies_for_normal_vessel,
    ]
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
        except AssertionError as e:
            print(f"  FAIL  {test.__name__}: {e}")
        except Exception as e:
            print(f"  ERROR {test.__name__}: {e}")
    print(f"\n{len(tests)} tests complete")
