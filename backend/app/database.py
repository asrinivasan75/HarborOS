"""SQLite database setup. Swap connection string for Postgres later."""

from __future__ import annotations

from datetime import datetime
import json
import os
from urllib.parse import parse_qs, urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_PATH = os.environ.get("HARBOROS_DB", "harboros.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


_VERIFICATION_REQUEST_SATELLITE_COLUMNS: dict[str, str] = {
    "satellite_source": "TEXT",
    "catalog_status": "TEXT",
    "request_lat": "FLOAT",
    "request_lng": "FLOAT",
    "bbox_west": "FLOAT",
    "bbox_south": "FLOAT",
    "bbox_east": "FLOAT",
    "bbox_north": "FLOAT",
    "search_spread_deg": "FLOAT",
    "search_days_back": "INTEGER",
    "search_max_cloud_cover": "FLOAT",
    "scene_acquired_at": "DATETIME",
    "scene_satellite": "TEXT",
    "scene_resolution_m": "FLOAT",
    "scene_cloud_cover_pct": "FLOAT",
    "scene_status": "TEXT",
    "scene_catalog_id": "TEXT",
    "scene_note": "TEXT",
}


def _table_columns(table_name: str) -> set[str]:
    with engine.begin() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).mappings().all()
    return {row["name"] for row in rows}


def _add_missing_verification_request_columns():
    existing = _table_columns("verification_requests")
    missing = {
        name: ddl
        for name, ddl in _VERIFICATION_REQUEST_SATELLITE_COLUMNS.items()
        if name not in existing
    }
    if not missing:
        return

    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE verification_requests ADD COLUMN {name} {ddl}"))


def _parse_bbox_from_media_ref(result_media_ref: str | None) -> tuple[float, float, float, float] | None:
    if not result_media_ref:
        return None

    try:
        bbox_param = parse_qs(urlparse(result_media_ref).query).get("bbox", [None])[0]
        if not bbox_param:
            return None
        west, south, east, north = [float(value) for value in bbox_param.split(",")]
        return west, south, east, north
    except Exception:
        return None


def _parse_legacy_satellite_payload(
    result_notes: str | None,
    result_media_ref: str | None,
) -> dict[str, object]:
    parsed: dict[str, object] = {}
    if result_notes:
        try:
            parsed = json.loads(result_notes)
        except Exception:
            parsed = {}

    last_pass = parsed.get("last_pass") if isinstance(parsed, dict) else None
    next_pass = parsed.get("next_pass") if isinstance(parsed, dict) else None
    search = parsed.get("search") if isinstance(parsed, dict) else None

    if isinstance(next_pass, dict) and (
        next_pass.get("status") == "delivered"
        or next_pass.get("acquired")
        or next_pass.get("catalog_id")
        or next_pass.get("note")
    ):
        scene = next_pass
    elif isinstance(last_pass, dict):
        scene = last_pass
    else:
        scene = {}

    return {
        "satellite_source": parsed.get("source") if isinstance(parsed, dict) else None,
        "catalog_status": parsed.get("catalog_status") if isinstance(parsed, dict) else None,
        "request_lat": parsed.get("vessel_lat") if isinstance(parsed, dict) else None,
        "request_lng": parsed.get("vessel_lng") if isinstance(parsed, dict) else None,
        "bbox": _parse_bbox_from_media_ref(result_media_ref),
        "search_spread_deg": search.get("spread_deg") if isinstance(search, dict) else None,
        "search_days_back": search.get("days_back") if isinstance(search, dict) else None,
        "search_max_cloud_cover": search.get("max_cloud_cover") if isinstance(search, dict) else None,
        "scene_acquired_at": scene.get("acquired") if isinstance(scene, dict) else None,
        "scene_satellite": scene.get("satellite") if isinstance(scene, dict) else None,
        "scene_resolution_m": scene.get("expected_resolution_m", scene.get("resolution_m")) if isinstance(scene, dict) else None,
        "scene_cloud_cover_pct": scene.get("cloud_cover_pct") if isinstance(scene, dict) else None,
        "scene_status": scene.get("status") if isinstance(scene, dict) else None,
        "scene_catalog_id": scene.get("catalog_id") if isinstance(scene, dict) else None,
        "scene_note": scene.get("note") if isinstance(scene, dict) else None,
    }


def _coerce_datetime(value: object) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    if not isinstance(value, str) or value == "":
        return None

    raw = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _backfill_verification_request_satellite_metadata():
    from app.models.domain import VerificationRequestORM

    db = SessionLocal()
    try:
        changed = False
        for vr in db.query(VerificationRequestORM).all():
            if vr.asset_type != "satellite":
                continue

            legacy = _parse_legacy_satellite_payload(vr.result_notes, vr.result_media_ref)
            bbox = legacy.get("bbox")

            if vr.satellite_source is None and legacy.get("satellite_source") is not None:
                vr.satellite_source = legacy["satellite_source"]
                changed = True
            if vr.catalog_status is None and legacy.get("catalog_status") is not None:
                vr.catalog_status = legacy["catalog_status"]
                changed = True
            if vr.request_lat is None and legacy.get("request_lat") is not None:
                vr.request_lat = float(legacy["request_lat"])
                changed = True
            if vr.request_lng is None and legacy.get("request_lng") is not None:
                vr.request_lng = float(legacy["request_lng"])
                changed = True

            if isinstance(bbox, tuple):
                west, south, east, north = bbox
                if vr.bbox_west is None:
                    vr.bbox_west = west
                    changed = True
                if vr.bbox_south is None:
                    vr.bbox_south = south
                    changed = True
                if vr.bbox_east is None:
                    vr.bbox_east = east
                    changed = True
                if vr.bbox_north is None:
                    vr.bbox_north = north
                    changed = True

            if vr.search_spread_deg is None and legacy.get("search_spread_deg") is not None:
                vr.search_spread_deg = float(legacy["search_spread_deg"])
                changed = True
            if vr.search_days_back is None and legacy.get("search_days_back") is not None:
                vr.search_days_back = int(legacy["search_days_back"])
                changed = True
            if vr.search_max_cloud_cover is None and legacy.get("search_max_cloud_cover") is not None:
                vr.search_max_cloud_cover = float(legacy["search_max_cloud_cover"])
                changed = True

            scene_acquired_at = _coerce_datetime(legacy.get("scene_acquired_at"))
            if vr.scene_acquired_at is None and scene_acquired_at is not None:
                vr.scene_acquired_at = scene_acquired_at
                changed = True
            if vr.scene_satellite is None and legacy.get("scene_satellite") is not None:
                vr.scene_satellite = str(legacy["scene_satellite"])
                changed = True
            if vr.scene_resolution_m is None and legacy.get("scene_resolution_m") is not None:
                vr.scene_resolution_m = float(legacy["scene_resolution_m"])
                changed = True
            if vr.scene_cloud_cover_pct is None and legacy.get("scene_cloud_cover_pct") is not None:
                vr.scene_cloud_cover_pct = float(legacy["scene_cloud_cover_pct"])
                changed = True
            if vr.scene_status is None and legacy.get("scene_status") is not None:
                vr.scene_status = str(legacy["scene_status"])
                changed = True
            if vr.scene_catalog_id is None and legacy.get("scene_catalog_id") is not None:
                vr.scene_catalog_id = str(legacy["scene_catalog_id"])
                changed = True
            if vr.scene_note is None and legacy.get("scene_note") is not None:
                vr.scene_note = str(legacy["scene_note"])
                changed = True

            if vr.status == "in_progress" and (
                vr.result_media_ref
                or vr.scene_satellite
                or vr.scene_status
            ):
                vr.status = "completed"
                changed = True

        if changed:
            db.commit()
    finally:
        db.close()


def upgrade_db_schema():
    _add_missing_verification_request_columns()
    _backfill_verification_request_satellite_metadata()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models.domain import (  # noqa: F401
        VesselORM, PositionReportORM, GeofenceORM,
        AlertORM, AnomalySignalORM, VerificationRequestORM, AlertAuditORM
    )
    Base.metadata.create_all(bind=engine)
    upgrade_db_schema()
