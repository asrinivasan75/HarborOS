"""Domain models — SQLAlchemy ORM + Pydantic schemas."""

from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
import json

from pydantic import BaseModel, Field
from sqlalchemy import Column, String, Float, Integer, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from app.database import Base


# ── Enums ──────────────────────────────────────────────

class VesselType(str, Enum):
    CARGO = "cargo"
    TANKER = "tanker"
    TUG = "tug"
    PASSENGER = "passenger"
    FISHING = "fishing"
    PLEASURE = "pleasure"
    MILITARY = "military"
    LAW_ENFORCEMENT = "law_enforcement"
    OTHER = "other"


class ActionRecommendation(str, Enum):
    IGNORE = "ignore"
    MONITOR = "monitor"
    VERIFY = "verify"
    ESCALATE = "escalate"


class AlertStatus(str, Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    DISMISSED = "dismissed"
    PINNED = "pinned"


class VerificationStatus(str, Enum):
    QUEUED = "queued"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class AnomalyType(str, Enum):
    GEOFENCE_BREACH = "geofence_breach"
    LOITERING = "loitering"
    SPEED_ANOMALY = "speed_anomaly"
    HEADING_ANOMALY = "heading_anomaly"
    ROUTE_DEVIATION = "route_deviation"
    AIS_GAP = "ais_gap"
    ZONE_LINGERING = "zone_lingering"
    TYPE_MISMATCH = "type_mismatch"
    COLLISION_RISK = "collision_risk"          # CPA/TCPA close approach
    KINEMATIC_IMPLAUSIBILITY = "kinematic_implausibility"  # Impossible speed/position jump
    STATISTICAL_OUTLIER = "statistical_outlier"  # Behavior deviates from regional mean
    DARK_SHIP_OPTICAL = "dark_ship_optical"      # Optical detection of vessel with no AIS


# ── SQLAlchemy ORM Models ──────────────────────────────

class VesselORM(Base):
    __tablename__ = "vessels"

    id = Column(String, primary_key=True)
    mmsi = Column(String, unique=True, index=True)
    name = Column(String)
    vessel_type = Column(String)
    flag_state = Column(String)
    length = Column(Float, nullable=True)
    beam = Column(Float, nullable=True)
    draft = Column(Float, nullable=True)
    imo = Column(String, nullable=True)
    callsign = Column(String, nullable=True)
    destination = Column(String, nullable=True)
    cargo_type = Column(String, nullable=True)
    region = Column(String, nullable=True, index=True)  # Region key (e.g. "black_sea", "la_harbor")
    inspection_deficiencies = Column(Integer, default=0)
    last_inspection_date = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    positions = relationship("PositionReportORM", back_populates="vessel", order_by="PositionReportORM.timestamp")


class PositionReportORM(Base):
    __tablename__ = "position_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vessel_id = Column(String, ForeignKey("vessels.id"), index=True)
    timestamp = Column(DateTime, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    speed_over_ground = Column(Float, nullable=True)  # knots
    course_over_ground = Column(Float, nullable=True)  # degrees
    heading = Column(Float, nullable=True)  # degrees
    nav_status = Column(String, nullable=True)

    vessel = relationship("VesselORM", back_populates="positions")


class GeofenceORM(Base):
    __tablename__ = "geofences"

    id = Column(String, primary_key=True)
    name = Column(String)
    zone_type = Column(String)  # restricted, shipping_lane, anchorage, security, environmental
    geometry_json = Column(Text)  # GeoJSON polygon
    severity = Column(String, default="high")  # how serious a breach is
    description = Column(String, nullable=True)


class AlertORM(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    vessel_id = Column(String, ForeignKey("vessels.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")
    risk_score = Column(Float)
    recommended_action = Column(String)
    explanation = Column(Text)
    anomaly_signals_json = Column(Text)  # JSON list of anomaly signal dicts
    operator_notes = Column(Text, nullable=True)
    feedback = Column(String, nullable=True)  # "confirmed", "false_positive", None
    feedback_at = Column(DateTime, nullable=True)

    vessel = relationship("VesselORM")
    audit_entries = relationship("AlertAuditORM", back_populates="alert", order_by="AlertAuditORM.timestamp")


class AlertAuditORM(Base):
    """Audit trail for operator actions on alerts."""
    __tablename__ = "alert_audit"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_id = Column(String, ForeignKey("alerts.id"), index=True)
    action = Column(String)  # "acknowledged", "dismissed", "pinned", "noted", "feedback", "verification_requested"
    details = Column(Text, nullable=True)  # JSON or free text
    timestamp = Column(DateTime, default=datetime.utcnow)

    alert = relationship("AlertORM", back_populates="audit_entries")


class AnomalySignalORM(Base):
    __tablename__ = "anomaly_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_id = Column(String, ForeignKey("alerts.id"), index=True)
    anomaly_type = Column(String)
    severity = Column(Float)  # 0-1
    description = Column(Text)
    details_json = Column(Text, nullable=True)  # extra context
    detected_at = Column(DateTime, default=datetime.utcnow)


class VerificationRequestORM(Base):
    __tablename__ = "verification_requests"

    id = Column(String, primary_key=True)
    alert_id = Column(String, ForeignKey("alerts.id"))
    vessel_id = Column(String, ForeignKey("vessels.id"))
    status = Column(String, default="queued")
    asset_type = Column(String, nullable=True)  # camera, patrol_boat, drone
    asset_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    result_confidence = Column(Float, nullable=True)
    result_notes = Column(Text, nullable=True)
    result_media_ref = Column(String, nullable=True)


# ── Pydantic Schemas ───────────────────────────────────

class PositionReportSchema(BaseModel):
    timestamp: datetime
    latitude: float
    longitude: float
    speed_over_ground: Optional[float] = None
    course_over_ground: Optional[float] = None
    heading: Optional[float] = None

    class Config:
        from_attributes = True


class AnomalySignalSchema(BaseModel):
    anomaly_type: str
    severity: float
    description: str
    details: Optional[dict] = None

    class Config:
        from_attributes = True


class VesselSchema(BaseModel):
    id: str
    mmsi: str
    name: str
    vessel_type: str
    flag_state: str
    length: Optional[float] = None
    beam: Optional[float] = None
    draft: Optional[float] = None
    imo: Optional[str] = None
    callsign: Optional[str] = None
    destination: Optional[str] = None
    region: Optional[str] = None
    latest_position: Optional[PositionReportSchema] = None
    risk_score: Optional[float] = None
    recommended_action: Optional[str] = None
    is_inactive: bool = False
    is_resolved: bool = False
    status_reason: Optional[str] = None

    class Config:
        from_attributes = True


class VesselDetailSchema(VesselSchema):
    positions: list[PositionReportSchema] = []
    anomaly_signals: list[AnomalySignalSchema] = []
    explanation: Optional[str] = None
    inspection_deficiencies: int = 0
    last_inspection_date: Optional[str] = None

    class Config:
        from_attributes = True


class GeofenceSchema(BaseModel):
    id: str
    name: str
    zone_type: str
    geometry: dict  # GeoJSON
    severity: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class AlertSchema(BaseModel):
    id: str
    vessel_id: str
    vessel_name: Optional[str] = None
    vessel_mmsi: Optional[str] = None
    created_at: datetime
    status: str
    risk_score: float
    recommended_action: str
    explanation: str
    anomaly_signals: list[AnomalySignalSchema] = []
    feedback: Optional[str] = None
    operator_notes: Optional[str] = None

    class Config:
        from_attributes = True


class AlertAuditSchema(BaseModel):
    action: str
    details: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class AlertActionRequest(BaseModel):
    action: str  # "acknowledge", "dismiss", "pin", "note", "feedback"
    notes: Optional[str] = None
    feedback: Optional[str] = None  # "confirmed" or "false_positive"


class DetectionMetricsSchema(BaseModel):
    total_alerts: int
    active_alerts: int
    acknowledged: int
    dismissed: int
    confirmed_threats: int
    false_positives: int
    pending_feedback: int
    precision: Optional[float] = None  # confirmed / (confirmed + false_positive)


class RiskHistogramBinSchema(BaseModel):
    bin_start: int
    bin_end: int
    count_active: int
    count_resolved: int


class RiskTierSchema(BaseModel):
    action: str  # escalate, verify, monitor, ignore
    count: int
    avg_signals: float
    top_signals: dict[str, int]


class RiskDistributionSchema(BaseModel):
    histogram: list[RiskHistogramBinSchema]
    tiers: list[RiskTierSchema]


class VerificationRequestSchema(BaseModel):
    id: str
    alert_id: str
    vessel_id: str
    status: str
    asset_type: Optional[str] = None
    asset_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    result_confidence: Optional[float] = None
    result_notes: Optional[str] = None
    result_media_ref: Optional[str] = None

    class Config:
        from_attributes = True


class VerificationRequestCreate(BaseModel):
    alert_id: str
    vessel_id: str
    asset_type: Optional[str] = "camera"


class RiskAssessmentSchema(BaseModel):
    vessel_id: str
    risk_score: float
    recommended_action: str
    explanation: str
    signals: list[AnomalySignalSchema]
    signal_breakdown: dict = Field(default_factory=dict)
