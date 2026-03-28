"""SQLite database setup. Swap connection string for Postgres later."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

DB_PATH = os.environ.get("HARBOROS_DB", "harboros.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


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
