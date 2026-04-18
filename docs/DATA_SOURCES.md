# HarborOS — Data Sources

## Strategy

All data sources implement a common adapter interface:

```python
class DataSourceAdapter:
    def load(self) -> list[dict]:
        """Load and return normalized records."""
        ...

    def is_available(self) -> bool:
        """Check if the real data source is accessible."""
        ...
```

If a real source is unavailable, the adapter falls back to demo fixtures in `data/demo/`.

## Source Adapters

### 1. AIS Vessel Traffic (Primary)

**Real source**: MarineCadastre.gov — historical AIS data in CSV format
**Schema**: MMSI, timestamp, lat, lon, SOG, COG, heading, vessel_name, vessel_type, flag
**Demo fallback**: `data/demo/ais_positions.json` — synthetic tracks for ~15 vessels around LA Harbor
**Adapter**: `backend/app/data_sources/ais_adapter.py`

### 2. NOAA Nautical Charts / GIS Layers

**Real source**: NOAA ENC Direct — shapefiles for navigational features
**Used for**: Geofence definitions (restricted zones, shipping lanes, anchorage areas, hazards)
**Demo fallback**: `data/demo/geofences.json` — hand-drawn GeoJSON polygons for LA Harbor zones
**Adapter**: `backend/app/data_sources/noaa_adapter.py`

### 3. NWS Weather Data

**Real source**: api.weather.gov — current conditions and marine forecasts
**Used for**: Contextual overlay (wind, visibility, sea state)
**Demo fallback**: `data/demo/weather.json` — static weather snapshot
**Adapter**: `backend/app/data_sources/nws_adapter.py`

### 4. USCG MISLE Deficiency Data (Optional Enrichment)

**Real source**: USCG Port State Control data
**Used for**: Vessel inspection history, deficiency counts, detention flags
**Demo fallback**: `data/demo/vessel_inspections.json` — synthetic inspection records
**Adapter**: `backend/app/data_sources/uscg_adapter.py`

## Demo Data Design

The demo dataset represents a 2-hour window at LA Harbor with:

- **15 vessels** with realistic metadata (names, MMSI, types, flags)
- **~50 position reports per vessel** (every ~2.5 minutes)
- **1 high-suspicion vessel** (MV DARK HORIZON) with geofence breach, loitering, speed anomalies, AIS gaps
- **2 moderate-suspicion vessels** with minor anomalies
- **12 normal vessels** following standard patterns
- **5 geofence zones** (restricted terminal, shipping lane, anchorage, security zone, environmental zone)

All coordinates are realistic for the LA Harbor / San Pedro area (approx 33.71°N, 118.27°W).

## Schema Normalization

All adapters normalize to these domain models:

| Source Data | Domain Model |
|-------------|-------------|
| AIS position record | `PositionReport` |
| AIS vessel metadata | `Vessel` |
| NOAA chart feature | `Geofence` |
| NWS observation | `WeatherContext` (informational only) |
| USCG inspection | `InspectionRecord` (enrichment) |
