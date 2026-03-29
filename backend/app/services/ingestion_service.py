"""
Live AIS ingestion service.

Runs as a background asyncio task within FastAPI.
Receives parsed AIS messages from AISStreamClient,
upserts vessels and position reports into the database,
and periodically re-runs anomaly detection.
"""

from __future__ import annotations
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.domain import VesselORM, PositionReportORM
from app.data_sources.aisstream_adapter import AISStreamClient
from app.services.alert_service import generate_alerts_for_all_vessels

logger = logging.getLogger("harboros.ingestion")


class IngestionService:
    """Manages live AIS data ingestion as a background task."""

    def __init__(self, api_key: str | None = None, region_keys: list[str] | None = None):
        self.client = AISStreamClient(api_key=api_key, region_keys=region_keys)
        self._task: asyncio.Task | None = None
        self._alert_task: asyncio.Task | None = None
        self._running = False
        self._vessels_seen: set[str] = set()
        self._positions_ingested = 0
        self._vessels_created = 0
        self._vessels_updated = 0
        self._last_alert_run: datetime | None = None

    @property
    def status(self) -> dict:
        return {
            "running": self._running,
            "connected": self.client.is_connected,
            "available": self.client.is_available,
            "vessels_seen": len(self._vessels_seen),
            "positions_ingested": self._positions_ingested,
            "vessels_created": self._vessels_created,
            "vessels_updated": self._vessels_updated,
            "last_alert_run": self._last_alert_run.isoformat() if self._last_alert_run else None,
            "stream_stats": self.client.stats,
        }

    async def start(self):
        """Start the ingestion background task."""
        if self._running:
            logger.warning("Ingestion already running")
            return

        if not self.client.is_available:
            logger.error("No AISStream API key — cannot start live ingestion")
            return

        self._running = True
        self._task = asyncio.create_task(self._ingest_loop())
        self._alert_task = asyncio.create_task(self._alert_loop())
        logger.info("Ingestion service started")

    async def stop(self):
        """Stop the ingestion background task."""
        self._running = False
        await self.client.disconnect()

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._alert_task:
            self._alert_task.cancel()
            try:
                await self._alert_task
            except asyncio.CancelledError:
                pass
            self._alert_task = None

        logger.info("Ingestion service stopped")

    async def _ingest_loop(self):
        """Main ingestion loop — connect and process messages."""
        batch: list[dict] = []
        batch_flush_interval = 2.0  # seconds
        last_flush = asyncio.get_event_loop().time()

        try:
            async for message in self.client.connect():
                if not self._running:
                    break

                batch.append(message)
                now = asyncio.get_event_loop().time()

                # Flush batch every N seconds or every 50 messages
                if len(batch) >= 50 or (now - last_flush) >= batch_flush_interval:
                    self._flush_batch(batch)
                    batch = []
                    last_flush = now

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Ingestion loop error: {e}")
        finally:
            # Flush remaining
            if batch:
                self._flush_batch(batch)

    def _flush_batch(self, batch: list[dict]):
        """Write a batch of AIS messages to the database."""
        if not batch:
            return

        db = SessionLocal()
        try:
            for msg in batch:
                if msg["type"] == "position":
                    self._upsert_position(db, msg)
                elif msg["type"] == "static":
                    self._upsert_vessel_static(db, msg)
            db.commit()
        except Exception as e:
            logger.error(f"Batch flush error: {e}")
            db.rollback()
        finally:
            db.close()

    def _upsert_position(self, db: Session, msg: dict):
        """Insert a position report and ensure the vessel exists."""
        mmsi = msg["mmsi"]
        data = msg["data"]
        timestamp = msg["timestamp"]

        region = msg.get("region")

        # Ensure vessel record exists
        vessel = db.query(VesselORM).filter(VesselORM.mmsi == mmsi).first()
        if not vessel:
            vessel = VesselORM(
                id=f"ais-{mmsi}",
                mmsi=mmsi,
                name=msg.get("ship_name") or f"MMSI {mmsi}",
                vessel_type="other",
                flag_state="Unknown",
                region=region,
                inspection_deficiencies=0,
            )
            db.add(vessel)
            db.flush()
            self._vessels_created += 1
            logger.info(f"New vessel: {vessel.name} (MMSI {mmsi}) in {region}")
        else:
            if msg.get("ship_name") and vessel.name.startswith("MMSI "):
                vessel.name = msg["ship_name"]
            # Update region to most recent sighting
            if region:
                vessel.region = region

        self._vessels_seen.add(mmsi)

        # AIS protocol: raw SOG value 1023 (102.3 kt) means "not available".
        # Heading 511 also means "not available". Filter these sentinel values.
        sog = data.get("speed_over_ground")
        if sog is not None and sog >= 102.2:
            sog = None  # Discard AIS "not available" sentinel

        # Insert position report
        pos = PositionReportORM(
            vessel_id=vessel.id,
            timestamp=timestamp.replace(tzinfo=None) if timestamp.tzinfo else timestamp,
            latitude=data["latitude"],
            longitude=data["longitude"],
            speed_over_ground=sog,
            course_over_ground=data.get("course_over_ground"),
            heading=data.get("heading") if data.get("heading") != 511 else None,
            nav_status=data.get("nav_status"),
        )
        db.add(pos)
        self._positions_ingested += 1

    def _upsert_vessel_static(self, db: Session, msg: dict):
        """Update vessel metadata from static data message."""
        mmsi = msg["mmsi"]
        data = msg["data"]

        vessel = db.query(VesselORM).filter(VesselORM.mmsi == mmsi).first()
        if not vessel:
            vessel = VesselORM(
                id=f"ais-{mmsi}",
                mmsi=mmsi,
                name=data.get("name") or f"MMSI {mmsi}",
                vessel_type=data.get("vessel_type", "other"),
                flag_state="Unknown",
                inspection_deficiencies=0,
            )
            db.add(vessel)
            self._vessels_created += 1
        else:
            self._vessels_updated += 1

        # Update fields if we got better data
        if data.get("name") and data["name"] != vessel.name:
            vessel.name = data["name"]
        if data.get("imo") and data["imo"] != "0":
            vessel.imo = data["imo"]
        if data.get("callsign"):
            vessel.callsign = data["callsign"]
        if data.get("destination"):
            vessel.destination = data["destination"]
        if data.get("vessel_type"):
            vessel.vessel_type = data["vessel_type"]
        if data.get("length"):
            vessel.length = data["length"]
        if data.get("beam"):
            vessel.beam = data["beam"]
        if data.get("draft"):
            vessel.draft = data["draft"]

        self._vessels_seen.add(mmsi)

    async def _alert_loop(self):
        """Periodically re-run anomaly detection and prune old data."""
        cycle = 0
        try:
            while self._running:
                await asyncio.sleep(30)

                if not self._running:
                    break

                cycle += 1
                db = SessionLocal()
                try:
                    alerts = generate_alerts_for_all_vessels(db)
                    self._last_alert_run = datetime.now(timezone.utc)
                    if alerts:
                        logger.info(f"Alert scan: {len(alerts)} alerts generated/updated")

                    # Archive old data every 10th cycle (~5 minutes)
                    if cycle % 10 == 0:
                        from app.services.archive_service import archive_old_positions
                        result = archive_old_positions(db=db)
                        if result["archived"] > 0:
                            logger.info(f"Archived {result['archived']} positions to Parquet")
                except Exception as e:
                    logger.error(f"Alert generation error: {e}")
                finally:
                    db.close()

        except asyncio.CancelledError:
            pass



# Singleton instance
_ingestion_service: IngestionService | None = None


def get_ingestion_service() -> IngestionService:
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = IngestionService()
    return _ingestion_service


def create_ingestion_service(api_key: str | None = None, region_keys: list[str] | None = None) -> IngestionService:
    global _ingestion_service
    _ingestion_service = IngestionService(api_key=api_key, region_keys=region_keys)
    return _ingestion_service
