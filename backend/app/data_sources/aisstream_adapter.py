"""
AISStream.io WebSocket adapter for live AIS data.

Connects to the AISStream WebSocket API, subscribes to a bounding box,
and yields decoded AIS messages (position reports and static vessel data).

Protocol: wss://stream.aisstream.io/v0/subscribe
Docs: https://aisstream.io/documentation
"""

from __future__ import annotations
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

import websockets

logger = logging.getLogger("harboros.aisstream")

AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream"

# Named regions with bounding boxes
# Format per region: [[lat_min, lon_min], [lat_max, lon_max]]
REGIONS: dict[str, dict] = {
    "la_harbor": {
        "name": "Los Angeles Harbor",
        "bbox": [[33.65, -118.35], [33.80, -118.15]],
        "center": [33.73, -118.26],
        "zoom": 12.5,
        "description": "Port of Los Angeles / Long Beach — busiest US container port",
    },
    "black_sea": {
        "name": "Black Sea",
        "bbox": [[41.0, 28.0], [46.8, 42.0]],
        "center": [43.5, 35.0],
        "zoom": 6,
        "description": "Black Sea — Odesa, Crimea, Sevastopol, Turkish straits",
    },
    "sea_of_azov": {
        "name": "Sea of Azov",
        "bbox": [[45.0, 34.5], [47.5, 39.5]],
        "center": [46.0, 37.0],
        "zoom": 7,
        "description": "Sea of Azov — Mariupol, Kerch Strait, contested waters",
    },
    "strait_of_hormuz": {
        "name": "Strait of Hormuz",
        "bbox": [[24.5, 54.0], [27.5, 58.0]],
        "center": [26.0, 56.5],
        "zoom": 8,
        "description": "Strait of Hormuz — critical oil transit chokepoint",
    },
    "south_china_sea": {
        "name": "South China Sea",
        "bbox": [[5.0, 109.0], [18.0, 121.0]],
        "center": [12.0, 115.0],
        "zoom": 5.5,
        "description": "South China Sea — Spratly Islands, territorial disputes",
    },
    "taiwan_strait": {
        "name": "Taiwan Strait",
        "bbox": [[22.5, 117.0], [26.0, 121.5]],
        "center": [24.5, 119.5],
        "zoom": 7,
        "description": "Taiwan Strait — major shipping lane, geopolitical flashpoint",
    },
    "strait_of_malacca": {
        "name": "Strait of Malacca",
        "bbox": [[0.5, 99.0], [5.0, 105.0]],
        "center": [2.5, 101.5],
        "zoom": 7,
        "description": "Strait of Malacca — world's busiest shipping lane",
    },
    "english_channel": {
        "name": "English Channel",
        "bbox": [[49.0, -2.5], [51.5, 2.5]],
        "center": [50.5, 0.5],
        "zoom": 7.5,
        "description": "English Channel / Dover Strait — dense European traffic",
    },
    "eastern_med": {
        "name": "Eastern Mediterranean",
        "bbox": [[33.0, 30.0], [37.0, 36.5]],
        "center": [35.0, 33.5],
        "zoom": 6.5,
        "description": "Eastern Mediterranean — Syria, Lebanon, Cyprus corridor",
    },
    "atlantic_demo": {
        "name": "Atlantic Demo Zone",
        "bbox": [[15.0, -50.0], [25.0, -30.0]],
        "center": [20.0, -40.0],
        "zoom": 6,
        "description": "SeaPod hardware demo — live edge node detection",
    },
}

# Default: all regions
DEFAULT_REGIONS = list(REGIONS.keys())

# AIS vessel type codes to our internal types
AIS_TYPE_MAP = {
    range(20, 30): "wing_in_ground",
    range(30, 36): "fishing",
    range(36, 40): "tug",
    range(40, 50): "high_speed",
    range(50, 55): "other",
    range(55, 60): "law_enforcement",
    range(60, 70): "passenger",
    range(70, 80): "cargo",
    range(80, 90): "tanker",
    range(90, 100): "other",
}


def classify_vessel_type(ais_type: int) -> str:
    """Map AIS ship type code to our internal vessel type."""
    for type_range, label in AIS_TYPE_MAP.items():
        if ais_type in type_range:
            return label
    return "other"


def parse_nav_status(status_code: int) -> str:
    """Map AIS navigational status code to human-readable string."""
    statuses = {
        0: "under_way_engine",
        1: "at_anchor",
        2: "not_under_command",
        3: "restricted_maneuverability",
        4: "constrained_by_draught",
        5: "moored",
        6: "aground",
        7: "engaged_in_fishing",
        8: "under_way_sailing",
        15: "not_defined",
    }
    return statuses.get(status_code, "unknown")


class AISStreamClient:
    """WebSocket client for AISStream.io live AIS data."""

    def __init__(
        self,
        api_key: str | None = None,
        region_keys: list[str] | None = None,
    ):
        self.api_key = api_key or os.environ.get("AISSTREAM_API_KEY", "")
        self.region_keys = region_keys or DEFAULT_REGIONS
        # Build bounding boxes from selected regions
        self.active_regions = {k: REGIONS[k] for k in self.region_keys if k in REGIONS}
        self.bounding_boxes = [r["bbox"] for r in self.active_regions.values()]
        self._ws = None
        self._running = False
        self.stats = {
            "messages_received": 0,
            "position_reports": 0,
            "static_data": 0,
            "errors": 0,
            "connected_since": None,
            "regions": list(self.active_regions.keys()),
        }

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    @property
    def is_connected(self) -> bool:
        return self._ws is not None and self._running

    def _build_subscription(self) -> str:
        """Build the subscription message for AISStream."""
        return json.dumps({
            "APIKey": self.api_key,
            "BoundingBoxes": self.bounding_boxes,
            "FilterMessageTypes": [
                "PositionReport",
                "ShipStaticData",
                "StandardClassBPositionReport",
            ],
        })

    async def connect(self) -> AsyncGenerator[dict, None]:
        """
        Connect to AISStream and yield parsed AIS messages.

        Yields dicts with keys:
          - type: "position" or "static"
          - mmsi: str
          - timestamp: datetime
          - data: dict of parsed fields
        """
        if not self.api_key:
            logger.error("No AISStream API key configured")
            return

        self._running = True
        retry_delay = 1

        while self._running:
            try:
                logger.info("Connecting to AISStream WebSocket...")
                async with websockets.connect(AISSTREAM_WS_URL) as ws:
                    self._ws = ws
                    self.stats["connected_since"] = datetime.now(timezone.utc).isoformat()
                    retry_delay = 1  # Reset on successful connection

                    # Send subscription
                    await ws.send(self._build_subscription())
                    logger.info(
                        f"Subscribed to AISStream with {len(self.bounding_boxes)} bounding box(es)"
                    )

                    async for raw_msg in ws:
                        if not self._running:
                            break

                        try:
                            msg = json.loads(raw_msg)
                            self.stats["messages_received"] += 1
                            parsed = self._parse_message(msg)
                            if parsed:
                                yield parsed
                        except json.JSONDecodeError:
                            self.stats["errors"] += 1
                            continue
                        except Exception as e:
                            self.stats["errors"] += 1
                            logger.warning(f"Error parsing AIS message: {e}")
                            continue

            except websockets.exceptions.ConnectionClosed as e:
                logger.warning(f"AISStream connection closed: {e}")
            except Exception as e:
                logger.error(f"AISStream connection error: {e}")
                self.stats["errors"] += 1

            self._ws = None

            if self._running:
                logger.info(f"Reconnecting in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)

    def classify_region(self, lat: float, lon: float) -> str | None:
        """Determine which named region a coordinate belongs to."""
        for key, region in self.active_regions.items():
            bbox = region["bbox"]
            if bbox[0][0] <= lat <= bbox[1][0] and bbox[0][1] <= lon <= bbox[1][1]:
                return key
        return None

    def _parse_message(self, msg: dict) -> dict | None:
        """Parse an AISStream message into our normalized format."""
        msg_type = msg.get("MessageType", "")
        meta = msg.get("MetaData", {})
        mmsi = str(meta.get("MMSI", ""))

        if not mmsi or mmsi == "0":
            return None

        timestamp_str = meta.get("time_utc", "")
        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            timestamp = datetime.now(timezone.utc)

        if msg_type in ("PositionReport", "StandardClassBPositionReport"):
            return self._parse_position_report(msg, mmsi, timestamp, msg_type)
        elif msg_type == "ShipStaticData":
            return self._parse_static_data(msg, mmsi, timestamp)

        return None

    def _parse_position_report(
        self, msg: dict, mmsi: str, timestamp: datetime, msg_type: str
    ) -> dict | None:
        """Parse a position report message."""
        report = msg.get("Message", {}).get(msg_type, {})
        if not report:
            return None

        lat = report.get("Latitude", 0)
        lon = report.get("Longitude", 0)

        # Filter out invalid positions
        if lat == 0 and lon == 0:
            return None
        if abs(lat) > 90 or abs(lon) > 180:
            return None
        # AIS uses 91.0 and 181.0 as "not available"
        if lat >= 91 or lon >= 181:
            return None

        self.stats["position_reports"] += 1

        region = self.classify_region(lat, lon)

        return {
            "type": "position",
            "mmsi": mmsi,
            "timestamp": timestamp,
            "ship_name": meta_name(msg.get("MetaData", {})),
            "region": region,
            "data": {
                "latitude": lat,
                "longitude": lon,
                "speed_over_ground": report.get("Sog"),
                "course_over_ground": report.get("Cog"),
                "heading": report.get("TrueHeading"),
                "nav_status": parse_nav_status(report.get("NavigationalStatus", 15)),
            },
        }

    def _parse_static_data(
        self, msg: dict, mmsi: str, timestamp: datetime
    ) -> dict | None:
        """Parse a ship static data message."""
        static = msg.get("Message", {}).get("ShipStaticData", {})
        if not static:
            return None

        self.stats["static_data"] += 1

        # Extract dimensions
        dimension = static.get("Dimension", {})
        length = (dimension.get("A", 0) or 0) + (dimension.get("B", 0) or 0)
        beam = (dimension.get("C", 0) or 0) + (dimension.get("D", 0) or 0)

        ais_type = static.get("Type", 0) or 0

        return {
            "type": "static",
            "mmsi": mmsi,
            "timestamp": timestamp,
            "data": {
                "name": static.get("Name", "").strip() or None,
                "imo": str(static.get("ImoNumber", "")) if static.get("ImoNumber") else None,
                "callsign": static.get("CallSign", "").strip() or None,
                "destination": static.get("Destination", "").strip() or None,
                "vessel_type": classify_vessel_type(ais_type),
                "ais_type_code": ais_type,
                "length": length if length > 0 else None,
                "beam": beam if beam > 0 else None,
                "draft": (static.get("MaximumStaticDraught", 0) or 0) / 10 or None,
            },
        }

    async def disconnect(self):
        """Gracefully disconnect from AISStream."""
        self._running = False
        if self._ws:
            await self._ws.close()
            self._ws = None
        logger.info("Disconnected from AISStream")


def meta_name(meta: dict) -> str | None:
    """Extract ship name from metadata, cleaning whitespace."""
    name = meta.get("ShipName", "")
    if name:
        name = name.strip()
        if name and name not in ("", "UNKNOWN", "0"):
            return name
    return None
