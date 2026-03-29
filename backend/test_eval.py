import sqlite3
import pandas as pd
from app.api.routes import compute_risk_assessment
from app.models.domain import VesselORM, AlertORM, PositionReportORM
from app.database import SessionLocal
from app.services.anomaly_detection import run_anomaly_detection
from app.models.domain import GeofenceORM

db = SessionLocal()
vessels = db.query(VesselORM).all()
geofences = db.query(GeofenceORM).all()

for v in vessels:
    positions = db.query(PositionReportORM).filter(PositionReportORM.vessel_id == v.id).order_by(PositionReportORM.timestamp).all()
    signals = run_anomaly_detection(v, positions, geofences)
    assessment = compute_risk_assessment(v, signals)
    score = assessment.risk_score
    
    if score >= 79 and score <= 81:
        print(f"Vessel {v.id}: name={v.name}, mmsi={v.mmsi}, score={score}, anomaly={assessment.signals}")
        print(f"   breakdown: {assessment.signal_breakdown}\n")
    if len(positions) == 0 and score > 70:
        print(f"Missing data vessel {v.id}: name={v.name}, score={score}, breakdown={assessment.signal_breakdown}")
