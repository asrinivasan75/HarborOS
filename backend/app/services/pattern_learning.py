"""
Historical pattern learning from archived Parquet data.

Reads archived position reports to build per-region, per-vessel-type
statistical baselines:
  - Speed distributions (mean, std, 5th/95th percentiles)
  - Heading change variance
  - Position density grid (route corridors)

Falls back to current SQLite data when no archives exist.
The learned baseline is cached in memory and refreshed on demand.
"""

from __future__ import annotations
import logging
import math
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("harboros.patterns")

ARCHIVE_DIR = Path(os.environ.get(
    "HARBOROS_ARCHIVE_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                 "data", "archive", "positions")
))

# Grid cell size in degrees (~1.1 km at equator)
GRID_CELL_DEG = 0.01


def _grid_key(lat: float, lon: float) -> str:
    """Snap a lat/lon to the nearest grid cell."""
    return f"{round(lat / GRID_CELL_DEG) * GRID_CELL_DEG:.4f},{round(lon / GRID_CELL_DEG) * GRID_CELL_DEG:.4f}"


def _percentile(sorted_vals: list[float], p: float) -> float:
    """Simple percentile on a pre-sorted list."""
    if not sorted_vals:
        return 0.0
    idx = (len(sorted_vals) - 1) * p
    lo = int(math.floor(idx))
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


class LearnedBaseline:
    """In-memory cache of learned behavioral baselines."""

    def __init__(self):
        # Structure: baselines[region][vessel_type] = stats_dict
        self.baselines: dict[str, dict[str, dict]] = {}
        self.last_refresh: Optional[datetime] = None
        self.total_records: int = 0

    def refresh(self, db_session=None):
        """Rebuild baselines from Parquet archives + SQLite fallback."""
        records = self._load_from_parquet()

        if not records and db_session:
            records = self._load_from_sqlite(db_session)

        if not records:
            logger.info("No historical data available for pattern learning")
            return

        self.total_records = len(records)
        self._compute_baselines(records)
        self.last_refresh = datetime.utcnow()
        logger.info(
            f"Learned baselines from {self.total_records} records: "
            f"{len(self.baselines)} regions, "
            f"{sum(len(v) for v in self.baselines.values())} type profiles"
        )

    def _load_from_parquet(self) -> list[dict]:
        """Load position records from archived Parquet files."""
        if not ARCHIVE_DIR.exists():
            return []

        parquet_files = sorted(ARCHIVE_DIR.glob("*.parquet"))
        if not parquet_files:
            return []

        try:
            import pyarrow.parquet as pq
        except ImportError:
            logger.warning("pyarrow not available for pattern learning")
            return []

        records = []
        for pf in parquet_files:
            try:
                table = pq.read_table(pf, columns=[
                    "vessel_id", "mmsi", "vessel_name", "timestamp",
                    "latitude", "longitude", "speed_over_ground",
                    "course_over_ground", "region",
                ])
                for i in range(table.num_rows):
                    records.append({
                        "vessel_id": str(table.column("vessel_id")[i]),
                        "region": str(table.column("region")[i]),
                        "latitude": float(table.column("latitude")[i].as_py()),
                        "longitude": float(table.column("longitude")[i].as_py()),
                        "speed": table.column("speed_over_ground")[i].as_py(),
                        "course": table.column("course_over_ground")[i].as_py(),
                        "timestamp": table.column("timestamp")[i].as_py(),
                    })
            except Exception as e:
                logger.warning(f"Failed to read {pf}: {e}")

        logger.info(f"Loaded {len(records)} records from {len(parquet_files)} Parquet files")
        return records

    def _load_from_sqlite(self, db_session) -> list[dict]:
        """Fallback: load from current SQLite position data."""
        from app.models.domain import PositionReportORM, VesselORM

        rows = (
            db_session.query(
                PositionReportORM.vessel_id,
                VesselORM.vessel_type,
                VesselORM.region,
                PositionReportORM.latitude,
                PositionReportORM.longitude,
                PositionReportORM.speed_over_ground,
                PositionReportORM.course_over_ground,
                PositionReportORM.timestamp,
            )
            .join(VesselORM, PositionReportORM.vessel_id == VesselORM.id)
            .order_by(PositionReportORM.timestamp)
            .limit(10000)
            .all()
        )

        records = []
        for r in rows:
            records.append({
                "vessel_id": r[0],
                "vessel_type": r[1],
                "region": r[2],
                "latitude": r[3],
                "longitude": r[4],
                "speed": r[5],
                "course": r[6],
                "timestamp": r[7],
            })
        logger.info(f"Loaded {len(records)} records from SQLite fallback")
        return records

    def _compute_baselines(self, records: list[dict]):
        """Compute per-region, per-vessel-type statistical baselines."""
        # Group records by region + vessel_type
        grouped: dict[str, dict[str, list[dict]]] = {}
        for rec in records:
            region = rec.get("region") or "unknown"
            vtype = rec.get("vessel_type") or "other"
            grouped.setdefault(region, {}).setdefault(vtype, []).append(rec)

        self.baselines = {}
        for region, types in grouped.items():
            self.baselines[region] = {}
            for vtype, recs in types.items():
                if len(recs) < 5:
                    continue
                self.baselines[region][vtype] = self._compute_type_stats(recs)

    def _compute_type_stats(self, records: list[dict]) -> dict:
        """Compute statistics for a single region+type group."""
        speeds = sorted([r["speed"] for r in records
                         if r["speed"] is not None and r["speed"] >= 0])
        courses = [r["course"] for r in records if r["course"] is not None]

        # Speed stats
        if speeds:
            speed_mean = sum(speeds) / len(speeds)
            speed_std = (sum((s - speed_mean) ** 2 for s in speeds) / len(speeds)) ** 0.5
            speed_p5 = _percentile(speeds, 0.05)
            speed_p95 = _percentile(speeds, 0.95)
        else:
            speed_mean = speed_std = speed_p5 = speed_p95 = 0.0

        # Heading change stats
        heading_changes = []
        for i in range(1, len(courses)):
            delta = abs(courses[i] - courses[i - 1])
            if delta > 180:
                delta = 360 - delta
            heading_changes.append(delta)

        if heading_changes:
            heading_mean = sum(heading_changes) / len(heading_changes)
            heading_std = (sum((h - heading_mean) ** 2 for h in heading_changes)
                          / len(heading_changes)) ** 0.5
        else:
            heading_mean = heading_std = 0.0

        # Position density grid (route corridors)
        density: dict[str, int] = {}
        for rec in records:
            key = _grid_key(rec["latitude"], rec["longitude"])
            density[key] = density.get(key, 0) + 1

        # Keep only cells with significant traffic (top 90% by count)
        if density:
            threshold = max(1, sorted(density.values())[len(density) // 10])
            corridor = {k: v for k, v in density.items() if v >= threshold}
        else:
            corridor = {}

        return {
            "speed_mean": round(speed_mean, 2),
            "speed_std": round(max(speed_std, 0.5), 2),
            "speed_p5": round(speed_p5, 2),
            "speed_p95": round(speed_p95, 2),
            "heading_change_mean": round(heading_mean, 2),
            "heading_change_std": round(max(heading_std, 1.0), 2),
            "position_corridor": corridor,
            "sample_count": len(records),
        }

    def get_baseline(self, region: str | None, vessel_type: str | None) -> dict | None:
        """Get learned baseline for a region+type combo.

        Falls back: exact match → region with "other" type → None.
        """
        if not self.baselines:
            return None

        region = region or "unknown"
        vtype = (vessel_type or "other").lower()

        region_data = self.baselines.get(region)
        if not region_data:
            return None

        return region_data.get(vtype) or region_data.get("other")

    def is_off_corridor(self, lat: float, lon: float,
                        region: str | None, vessel_type: str | None) -> tuple[bool, float]:
        """Check if a position is outside the learned route corridor.

        Returns (is_off, min_distance_to_corridor_cells) in grid cell units.
        """
        baseline = self.get_baseline(region, vessel_type)
        if not baseline or not baseline.get("position_corridor"):
            return False, 0.0

        corridor = baseline["position_corridor"]
        vessel_key = _grid_key(lat, lon)

        # Direct hit — on corridor
        if vessel_key in corridor:
            return False, 0.0

        # Compute minimum distance to any corridor cell
        vlat = round(lat / GRID_CELL_DEG) * GRID_CELL_DEG
        vlon = round(lon / GRID_CELL_DEG) * GRID_CELL_DEG

        min_dist = float("inf")
        for cell_key in corridor:
            parts = cell_key.split(",")
            clat, clon = float(parts[0]), float(parts[1])
            dist = math.sqrt((vlat - clat) ** 2 + (vlon - clon) ** 2) / GRID_CELL_DEG
            min_dist = min(min_dist, dist)
            if min_dist < 2:
                return False, min_dist  # Close enough

        # Off corridor if > 5 grid cells (~5.5km) from any known traffic
        return min_dist > 5, min_dist

    def summary(self) -> dict:
        """Return a summary of learned baselines for the API."""
        result = {
            "last_refresh": self.last_refresh.isoformat() if self.last_refresh else None,
            "total_records": self.total_records,
            "regions": {},
        }
        for region, types in self.baselines.items():
            result["regions"][region] = {}
            for vtype, stats in types.items():
                result["regions"][region][vtype] = {
                    "speed_mean": stats["speed_mean"],
                    "speed_std": stats["speed_std"],
                    "speed_p5": stats["speed_p5"],
                    "speed_p95": stats["speed_p95"],
                    "heading_change_mean": stats["heading_change_mean"],
                    "heading_change_std": stats["heading_change_std"],
                    "corridor_cells": len(stats.get("position_corridor", {})),
                    "sample_count": stats["sample_count"],
                }
        return result


# ── Singleton ─────────────────────────────────────────

_baseline_instance: LearnedBaseline | None = None


def get_learned_baseline() -> LearnedBaseline:
    """Get or create the singleton learned baseline."""
    global _baseline_instance
    if _baseline_instance is None:
        _baseline_instance = LearnedBaseline()
    return _baseline_instance


def refresh_baseline(db_session=None) -> LearnedBaseline:
    """Force refresh the learned baseline."""
    baseline = get_learned_baseline()
    baseline.refresh(db_session)
    return baseline
