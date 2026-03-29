"""
Copernicus Data Space Sentinel-2 adapter.

Provides real Sentinel-2 imagery via the Copernicus Data Space Ecosystem (CDSE):
- OAuth2 token management (client credentials flow)
- Catalog API: search for recent acquisitions over an area
- Process API: request rendered imagery for a bbox + time
- WMTS tile URL with auth for MapLibre overlay

Setup:
  1. Register at https://dataspace.copernicus.eu
  2. Create OAuth client at https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings
  3. Set env vars: CDSE_CLIENT_ID, CDSE_CLIENT_SECRET

Falls back to Esri World Imagery when credentials are not configured.
"""

from __future__ import annotations
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("harboros.sentinel")

# ── Copernicus Data Space endpoints ──────────────────
CDSE_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CDSE_CATALOG_URL = "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search"
CDSE_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
CDSE_WMTS_URL = (
    "https://sh.dataspace.copernicus.eu/ogc/wmts/"
    "{instance_id}?Service=WMTS&Request=GetTile&Version=1.0.0"
    "&Layer=TRUE-COLOR-S2L2A&Style=default"
    "&Format=image/png&TileMatrixSet=PopularWebMercator512"
    "&TileMatrix={z}&TileCol={x}&TileRow={y}"
)

# Esri fallback (no auth needed)
ESRI_TILE_URL = (
    "https://server.arcgisonline.com/ArcGIS/rest/services/"
    "World_Imagery/MapServer/tile/{z}/{y}/{x}"
)


# ── OAuth2 Token Manager ────────────────────────────

class _TokenCache:
    """Caches the OAuth2 access token and refreshes before expiry."""
    def __init__(self):
        self.access_token: Optional[str] = None
        self.expires_at: float = 0

    def get_token(self) -> Optional[str]:
        client_id = os.environ.get("CDSE_CLIENT_ID", "")
        client_secret = os.environ.get("CDSE_CLIENT_SECRET", "")
        if not client_id or not client_secret:
            return None

        # Return cached token if still valid (with 60s buffer)
        if self.access_token and time.time() < self.expires_at - 60:
            return self.access_token

        try:
            import requests
            resp = requests.post(CDSE_TOKEN_URL, data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            }, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            self.access_token = data["access_token"]
            self.expires_at = time.time() + data.get("expires_in", 300)
            logger.info("CDSE OAuth token acquired (expires in %ds)", data.get("expires_in", 300))
            return self.access_token
        except Exception as e:
            logger.error("Failed to get CDSE token: %s", e)
            self.access_token = None
            return None

_token_cache = _TokenCache()


def is_configured() -> bool:
    """Check if Copernicus Data Space credentials are set."""
    return bool(os.environ.get("CDSE_CLIENT_ID") and os.environ.get("CDSE_CLIENT_SECRET"))


# ── Catalog API: Search for Imagery ─────────────────

def search_imagery(
    bbox: list[float],
    days_back: int = 30,
    max_cloud_cover: float = 30.0,
    limit: int = 5,
) -> list[dict]:
    """Search for recent Sentinel-2 acquisitions over a bounding box.

    Args:
        bbox: [west, south, east, north] in WGS84
        days_back: how far back to search
        max_cloud_cover: max cloud cover percentage (0-100)
        limit: max results to return

    Returns:
        List of dicts with acquisition date, cloud cover, geometry, etc.
        Sorted by date descending (most recent first).
    """
    token = _token_cache.get_token()
    if not token:
        return []

    end = datetime.utcnow()
    start = end - timedelta(days=days_back)

    search_body = {
        "collections": ["sentinel-2-l2a"],
        "datetime": f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end.strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "bbox": bbox,
        "limit": limit,
        "filter": f"eo:cloud_cover < {max_cloud_cover}",
        "filter-lang": "cql2-text",
        "sortby": [{"field": "datetime", "direction": "desc"}],
    }

    try:
        import requests
        resp = requests.post(
            CDSE_CATALOG_URL,
            json=search_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])

        results = []
        for feat in features:
            props = feat.get("properties", {})
            results.append({
                "id": feat.get("id"),
                "datetime": props.get("datetime"),
                "cloud_cover": props.get("eo:cloud_cover"),
                "satellite": props.get("platform", "Sentinel-2"),
                "processing_level": props.get("processing:level", "L2A"),
                "bbox": feat.get("bbox"),
                "geometry": feat.get("geometry"),
            })
        return results

    except Exception as e:
        logger.error("CDSE catalog search failed: %s", e)
        return []


# ── Process API: Render Imagery ─────────────────────

def get_imagery_png(
    bbox: list[float],
    width: int = 512,
    height: int = 512,
    date_from: str | None = None,
    date_to: str | None = None,
) -> bytes | None:
    """Request rendered Sentinel-2 true color imagery as PNG.

    Args:
        bbox: [west, south, east, north] in WGS84
        width: output image width in pixels
        height: output image height in pixels
        date_from: ISO date string (default: 10 days ago)
        date_to: ISO date string (default: today)

    Returns:
        PNG image bytes, or None on failure.
    """
    token = _token_cache.get_token()
    if not token:
        return None

    if not date_to:
        date_to = datetime.utcnow().strftime("%Y-%m-%d")
    if not date_from:
        date_from = (datetime.utcnow() - timedelta(days=10)).strftime("%Y-%m-%d")

    evalscript = """
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B03", "B02"], units: "DN" }],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  return [sample.B04 * 3.5 / 10000,
          sample.B03 * 3.5 / 10000,
          sample.B02 * 3.5 / 10000];
}
"""

    process_body = {
        "input": {
            "bounds": {
                "bbox": bbox,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "timeRange": {
                        "from": f"{date_from}T00:00:00Z",
                        "to": f"{date_to}T23:59:59Z",
                    },
                    "maxCloudCoverage": 30,
                    "mosaickingOrder": "mostRecent",
                },
            }],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": evalscript,
    }

    try:
        import requests
        resp = requests.post(
            CDSE_PROCESS_URL,
            json=process_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "image/png",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.content

    except Exception as e:
        logger.error("CDSE process request failed: %s", e)
        return None


# ── Public API (used by routes.py) ──────────────────

def get_sentinel2_tile_url(days_back: int = 30) -> dict:
    """Get tile URL for MapLibre.

    When CDSE is configured, returns a proxy URL served by our backend
    (since CDSE WMTS requires auth). Otherwise falls back to Esri.
    """
    end = datetime.utcnow()
    start = end - timedelta(days=days_back)
    time_range = f"{start.strftime('%Y-%m-%d')}/{end.strftime('%Y-%m-%d')}"

    if is_configured():
        # Frontend will use our proxy endpoint that adds auth
        return {
            "tile_url": "/api/satellite/tile/{z}/{x}/{y}",
            "source": "Copernicus Sentinel-2 L2A (ESA)",
            "time_range": time_range,
            "resolution": "10m",
            "note": "Real Sentinel-2 imagery via Copernicus Data Space",
            "sentinel2_available": True,
        }

    return {
        "tile_url": ESRI_TILE_URL,
        "source": "Esri World Imagery (Maxar, Earthstar Geographics)",
        "time_range": time_range,
        "resolution": "~1m (varies by location)",
        "note": "Fallback imagery. Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET for real Sentinel-2.",
        "sentinel2_available": False,
    }


def get_sentinel2_info() -> dict:
    """Get info about Sentinel-2 constellation and integration status."""
    configured = is_configured()
    return {
        "constellation": "Sentinel-2 (ESA Copernicus)",
        "satellites": ["Sentinel-2A", "Sentinel-2B"],
        "resolution": "10m (visible bands), 20m (red edge/SWIR), 60m (atmospheric)",
        "revisit_days": 5,
        "swath_width_km": 290,
        "bands": 13,
        "orbit": "Sun-synchronous, 786km altitude",
        "data_access": "Copernicus Data Space (free)",
        "configured": configured,
        "integration_status": "Live — real Sentinel-2 imagery" if configured else "Not configured — using Esri fallback",
    }
