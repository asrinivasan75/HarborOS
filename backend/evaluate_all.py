import sqlite3
import pandas as pd
from app.api.routes import compute_risk_assessment
from app.models.domain import VesselORM, AlertORM
from app.database import SessionLocal
import json

db = SessionLocal()
vessels = db.query(VesselORM).all()

for v in vessels:
    alert = db.query(AlertORM).filter(AlertORM.vessel_id == v.id, AlertORM.status == "active").first()
    if alert:
        print(f"Vessel {v.id}: name={v.name}, score={alert.risk_score}")
        if round(alert.risk_score) == 80:
            print(f"  --> EXACTLY 80! Signals: {alert.anomaly_signals_json}")
    else:
        # compute it
        pass
