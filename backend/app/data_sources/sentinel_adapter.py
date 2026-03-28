"""
Sentinel Hub adapter for Sentinel-2 satellite imagery.

Uses the Sentinel Hub WMS/WMTS service to provide recent satellite imagery
as map tile overlays. The free tier provides access to Sentinel-2 L2A data
(10m resolution, 5-day revisit) without authentication for WMS tiles.

This adapter provides:
- WMTS tile URL templates for MapLibre integration
- Metadata about recent imagery availability
"""

from __future__ import annotations
from datetime import datetime, timedelta


# Sentinel Hub free WMS endpoint for Sentinel-2 true color
# This uses the Copernicus Browser WMTS endpoint — no API key required
SENTINEL2_WMTS_URL = (
    "https://services.sentinel-hub.com/ogc/wmts/"
    "cd280189-7c51-45a6-ab05-f96a76067710"  # Sentinel-2 L2A instance
    "?Service=WMTS&Request=GetTile&Version=1.0.0"
    "&Layer=TRUE-COLOR-S2L2A"
    "&Style=default"
    "&Format=image/png"
    "&TileMatrixSet=PopularWebMercator512"
    "&TileMatrix={z}"
    "&TileCol={x}"
    "&TileRow={y}"
    "&TIME={time_range}"
)

# Alternative: use ESA Copernicus Data Space (free, no auth for tiles)
COPERNICUS_WMTS_URL = (
    "https://sh.dataspace.copernicus.eu/ogc/wmts/"
    "a]?Service=WMTS&Request=GetTile&Version=1.0.0"
    "&Layer=TRUE-COLOR-S2L2A&Style=default"
    "&Format=image/png&TileMatrixSet=PopularWebMercator512"
    "&TileMatrix={z}&TileCol={x}&TileRow={y}"
)


def get_sentinel2_tile_url(days_back: int = 30) -> dict:
    """Get Sentinel-2 WMTS tile URL template for MapLibre.

    Returns a dict with the tile URL and metadata for the frontend to use.
    The time range covers the last N days to ensure cloud-free composites.
    """
    end = datetime.utcnow()
    start = end - timedelta(days=days_back)
    time_range = f"{start.strftime('%Y-%m-%d')}/{end.strftime('%Y-%m-%d')}"

    # Primary: Esri World Imagery (always works, high quality)
    # This is the same source we use for the satellite base map
    # but exposed as an overlay for Tier 3 integration point
    tile_url = (
        "https://server.arcgisonline.com/ArcGIS/rest/services/"
        "World_Imagery/MapServer/tile/{z}/{y}/{x}"
    )

    return {
        "tile_url": tile_url,
        "source": "Esri World Imagery (Maxar, Earthstar Geographics)",
        "time_range": time_range,
        "resolution": "~1m (varies by location)",
        "note": "Composite imagery — not real-time. For true Sentinel-2 integration, configure SENTINEL_HUB_API_KEY.",
        "sentinel2_available": False,  # True when Sentinel Hub API key is configured
    }


def get_sentinel2_info() -> dict:
    """Get info about Sentinel-2 satellite constellation and coverage."""
    return {
        "constellation": "Sentinel-2 (ESA Copernicus)",
        "satellites": ["Sentinel-2A", "Sentinel-2B"],
        "resolution": "10m (visible bands), 20m (red edge/SWIR), 60m (atmospheric)",
        "revisit_days": 5,
        "swath_width_km": 290,
        "bands": 13,
        "orbit": "Sun-synchronous, 786km altitude",
        "data_access": "Free via Copernicus Data Space",
        "integration_status": "Stub — tile overlay available, direct API requires key",
    }
