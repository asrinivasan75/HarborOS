"""Tests for risk scoring engine."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models.domain import AnomalySignalSchema, AnomalyType, ActionRecommendation
from app.services.risk_scoring import (
    compute_risk_assessment,
    score_anomaly_signals,
    determine_action,
)


class FakeVessel:
    def __init__(self, **kwargs):
        defaults = {
            "id": "v1", "name": "Test", "mmsi": "123456789",
            "imo": "1234567", "callsign": "TEST", "destination": "PORT",
            "flag_state": "US", "inspection_deficiencies": 0,
        }
        defaults.update(kwargs)
        for k, v in defaults.items():
            setattr(self, k, v)


def test_high_risk_vessel():
    vessel = FakeVessel(
        imo=None, callsign=None, destination="UNKNOWN",
        inspection_deficiencies=4
    )
    signals = [
        AnomalySignalSchema(anomaly_type=AnomalyType.GEOFENCE_BREACH, severity=0.9, description="test"),
        AnomalySignalSchema(anomaly_type=AnomalyType.LOITERING, severity=0.7, description="test"),
        AnomalySignalSchema(anomaly_type=AnomalyType.SPEED_ANOMALY, severity=0.8, description="test"),
        AnomalySignalSchema(anomaly_type=AnomalyType.AIS_GAP, severity=0.6, description="test"),
    ]
    assessment = compute_risk_assessment(vessel, signals)
    assert assessment.risk_score >= 70, f"Expected escalate, got {assessment.risk_score}"
    assert assessment.recommended_action == ActionRecommendation.ESCALATE


def test_low_risk_vessel():
    vessel = FakeVessel()
    signals = []
    assessment = compute_risk_assessment(vessel, signals)
    assert assessment.risk_score < 25, f"Expected ignore, got {assessment.risk_score}"
    assert assessment.recommended_action == ActionRecommendation.IGNORE


def test_medium_risk_vessel():
    vessel = FakeVessel(inspection_deficiencies=2)
    signals = [
        AnomalySignalSchema(anomaly_type=AnomalyType.SPEED_ANOMALY, severity=0.7, description="test"),
        AnomalySignalSchema(anomaly_type=AnomalyType.LOITERING, severity=0.6, description="test"),
    ]
    assessment = compute_risk_assessment(vessel, signals)
    assert 20 < assessment.risk_score < 60, f"Expected moderate risk, got {assessment.risk_score}"


def test_action_thresholds():
    assert determine_action(10) == ActionRecommendation.IGNORE
    assert determine_action(30) == ActionRecommendation.MONITOR
    assert determine_action(50) == ActionRecommendation.VERIFY
    assert determine_action(80) == ActionRecommendation.ESCALATE


def test_explanation_contains_signals():
    vessel = FakeVessel()
    signals = [
        AnomalySignalSchema(anomaly_type=AnomalyType.GEOFENCE_BREACH, severity=0.9, description="Entered restricted zone"),
    ]
    assessment = compute_risk_assessment(vessel, signals)
    assert "restricted zone" in assessment.explanation.lower()


def test_metadata_penalty():
    # Vessel with missing metadata should score higher
    complete = FakeVessel()
    incomplete = FakeVessel(imo=None, callsign=None, destination=None)

    signals = [
        AnomalySignalSchema(anomaly_type=AnomalyType.LOITERING, severity=0.5, description="test"),
    ]

    score_complete = compute_risk_assessment(complete, signals).risk_score
    score_incomplete = compute_risk_assessment(incomplete, signals).risk_score
    assert score_incomplete > score_complete, "Missing metadata should increase risk score"


if __name__ == "__main__":
    tests = [
        test_high_risk_vessel,
        test_low_risk_vessel,
        test_medium_risk_vessel,
        test_action_thresholds,
        test_explanation_contains_signals,
        test_metadata_penalty,
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
