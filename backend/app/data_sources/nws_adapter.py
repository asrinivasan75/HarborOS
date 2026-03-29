"""
National Weather Service (NWS) API adapter.

Fetches real-time weather conditions for vessel positions using the free
NWS API (api.weather.gov). No API key required — only a User-Agent header.

Coverage: US territory and coastal waters only. Offshore/international
positions return None gracefully — detection runs without adjustment.

Caching: Positions are bucketed to a 0.5° grid with 15-minute TTL to
respect NWS rate limits (~1 req/sec max).
"""

from __future__ import annotations
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("harboros.weather")

NWS_POINTS_URL = "https://api.weather.gov/points/{lat},{lon}"
NWS_HEADERS = {
    "User-Agent": "HarborOS/1.0 (maritime-awareness)",
    "Accept": "application/geo+json",
}

CACHE_TTL_SEC = 900  # 15 minutes


@dataclass
class WeatherConditions:
    """Weather snapshot for a position."""
    wind_speed_kt: float = 0.0
    wind_direction: str = ""
    visibility_nm: float = 10.0  # default clear
    temperature_f: Optional[float] = None
    description: str = ""
    fetched_at: float = field(default_factory=time.time)


# ── Cache ─────────────────────────────────────────────

_weather_cache: dict[tuple[float, float], tuple[WeatherConditions | None, float]] = {}


def _grid_key(lat: float, lon: float) -> tuple[float, float]:
    """Bucket to 0.5° grid for cache deduplication."""
    return (round(lat * 2) / 2, round(lon * 2) / 2)


def _cache_get(lat: float, lon: float) -> WeatherConditions | None | type[...]:
    """Return cached result or Ellipsis if not cached/expired."""
    key = _grid_key(lat, lon)
    entry = _weather_cache.get(key)
    if entry is None:
        return ...
    conditions, ts = entry
    if time.time() - ts > CACHE_TTL_SEC:
        del _weather_cache[key]
        return ...
    return conditions


def _cache_set(lat: float, lon: float, conditions: WeatherConditions | None) -> None:
    key = _grid_key(lat, lon)
    _weather_cache[key] = (conditions, time.time())


# ── NWS API ───────────────────────────────────────────

def _parse_wind_speed_kt(value: str | None) -> float:
    """Parse NWS wind speed string (e.g., '15 mph') to knots."""
    if not value:
        return 0.0
    try:
        parts = value.lower().split()
        speed = float(parts[0])
        if "mph" in value.lower():
            return speed * 0.868976  # mph to knots
        if "km/h" in value.lower() or "kph" in value.lower():
            return speed * 0.539957
        return speed  # assume knots
    except (ValueError, IndexError):
        return 0.0


def _parse_visibility(value: str | None) -> float:
    """Parse NWS visibility string to nautical miles."""
    if not value:
        return 10.0  # default clear
    try:
        parts = value.lower().split()
        dist = float(parts[0])
        if "mi" in value.lower():
            return dist * 0.868976  # statute miles to nm
        if "km" in value.lower():
            return dist * 0.539957
        return dist
    except (ValueError, IndexError):
        return 10.0


def get_weather(lat: float, lon: float) -> WeatherConditions | None:
    """Fetch current weather conditions for a position via NWS API.

    Returns None for positions outside NWS coverage (non-US) or on error.
    Results are cached by 0.5° grid cell for 15 minutes.
    """
    cached = _cache_get(lat, lon)
    if cached is not ...:
        return cached

    try:
        import requests

        # Step 1: Get the forecast grid for this position
        points_url = NWS_POINTS_URL.format(lat=round(lat, 4), lon=round(lon, 4))
        resp = requests.get(points_url, headers=NWS_HEADERS, timeout=5)

        if resp.status_code == 404:
            # Position outside NWS coverage (offshore / non-US)
            _cache_set(lat, lon, None)
            return None
        resp.raise_for_status()

        props = resp.json().get("properties", {})
        forecast_url = props.get("forecastHourly")
        if not forecast_url:
            _cache_set(lat, lon, None)
            return None

        # Step 2: Get hourly forecast (current conditions)
        forecast_resp = requests.get(forecast_url, headers=NWS_HEADERS, timeout=8)
        forecast_resp.raise_for_status()

        periods = forecast_resp.json().get("properties", {}).get("periods", [])
        if not periods:
            _cache_set(lat, lon, None)
            return None

        current = periods[0]

        # Parse wind speed
        wind_str = current.get("windSpeed", "0 mph")
        wind_speed_kt = _parse_wind_speed_kt(wind_str)

        # Visibility: NWS hourly forecast doesn't always include it directly,
        # but the short forecast text often mentions fog/visibility conditions
        short_forecast = current.get("shortForecast", "")
        detailed = current.get("detailedForecast", "")

        # Estimate visibility from forecast text
        visibility_nm = 10.0
        low_vis_terms = ["fog", "mist", "haze", "smoke", "blowing"]
        if any(term in short_forecast.lower() or term in detailed.lower() for term in low_vis_terms):
            if "dense fog" in detailed.lower() or "dense fog" in short_forecast.lower():
                visibility_nm = 0.25
            elif "fog" in short_forecast.lower():
                visibility_nm = 1.0
            elif "mist" in short_forecast.lower() or "haze" in short_forecast.lower():
                visibility_nm = 3.0

        conditions = WeatherConditions(
            wind_speed_kt=wind_speed_kt,
            wind_direction=current.get("windDirection", ""),
            visibility_nm=visibility_nm,
            temperature_f=current.get("temperature"),
            description=short_forecast,
        )

        _cache_set(lat, lon, conditions)
        logger.info(
            "Weather at (%.2f, %.2f): wind %.0f kt %s, vis %.1f nm — %s",
            lat, lon, wind_speed_kt, conditions.wind_direction,
            visibility_nm, short_forecast,
        )
        return conditions

    except Exception as e:
        logger.warning("NWS weather fetch failed for (%.2f, %.2f): %s", lat, lon, e)
        _cache_set(lat, lon, None)
        return None


def is_adverse(conditions: WeatherConditions | None) -> bool:
    """Check if weather conditions warrant threshold adjustments."""
    if conditions is None:
        return False
    return conditions.wind_speed_kt > 25 or conditions.visibility_nm < 2.0
