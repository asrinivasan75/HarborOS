const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────

export interface Position {
  timestamp: string;
  latitude: number;
  longitude: number;
  speed_over_ground: number | null;
  course_over_ground: number | null;
  heading: number | null;
}

export interface Vessel {
  id: string;
  mmsi: string;
  name: string;
  vessel_type: string;
  flag_state: string;
  length: number | null;
  beam: number | null;
  draft: number | null;
  imo: string | null;
  callsign: string | null;
  destination: string | null;
  latest_position: Position | null;
  risk_score: number | null;
  recommended_action: string | null;
}

export interface VesselDetail extends Vessel {
  positions: Position[];
  anomaly_signals: AnomalySignal[];
  explanation: string | null;
  inspection_deficiencies: number;
  last_inspection_date: string | null;
}

export interface AnomalySignal {
  anomaly_type: string;
  severity: number;
  description: string;
  details: Record<string, unknown> | null;
}

export interface Alert {
  id: string;
  vessel_id: string;
  vessel_name: string | null;
  vessel_mmsi: string | null;
  created_at: string;
  status: string;
  risk_score: number;
  recommended_action: string;
  explanation: string;
  anomaly_signals: AnomalySignal[];
}

export interface Geofence {
  id: string;
  name: string;
  zone_type: string;
  geometry: GeoJSON.Geometry;
  severity: string;
  description: string | null;
}

export interface VerificationRequest {
  id: string;
  alert_id: string;
  vessel_id: string;
  status: string;
  asset_type: string | null;
  asset_id: string | null;
  created_at: string;
  updated_at: string;
  result_confidence: number | null;
  result_notes: string | null;
  result_media_ref: string | null;
}

export interface Timeline {
  start: string | null;
  end: string | null;
  total_reports: number;
}

export interface Region {
  name: string;
  center: [number, number];
  zoom: number;
  description: string;
  bbox: [[number, number], [number, number]];
}

export interface IngestionStatus {
  running: boolean;
  connected: boolean;
  available: boolean;
  vessels_seen: number;
  positions_ingested: number;
  vessels_created: number;
  vessels_updated: number;
  last_alert_run: string | null;
  stream_stats: {
    messages_received: number;
    position_reports: number;
    static_data: number;
    errors: number;
    connected_since: string | null;
    regions?: string[];
  };
}

// ── Paginated Response ────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlertAudit {
  action: string;
  details: string | null;
  timestamp: string;
}

export interface DetectionMetrics {
  total_alerts: number;
  active_alerts: number;
  acknowledged: number;
  dismissed: number;
  confirmed_threats: number;
  false_positives: number;
  pending_feedback: number;
  precision: number | null;
}

// ── API Functions ─────────────────────────────────────

export const api = {
  getRegions: () => fetchAPI<Record<string, Region>>("/regions"),
  getVessels: (region?: string, limit = 500, offset = 0) => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return fetchAPI<PaginatedResponse<Vessel>>(`/vessels?${params}`);
  },
  getVesselDetail: (id: string) => fetchAPI<VesselDetail>(`/vessels/${id}`),
  getAlerts: (status?: string, region?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (region) params.set("region", region);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return fetchAPI<PaginatedResponse<Alert>>(`/alerts?${params}`);
  },
  getAlertDetail: (id: string) => fetchAPI<Alert>(`/alerts/${id}`),
  alertAction: (id: string, action: string, notes?: string, feedback?: string) =>
    fetchAPI<{ id: string; status: string; feedback: string | null }>(`/alerts/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action, notes: notes || null, feedback: feedback || null }),
    }),
  getAlertAudit: (id: string) => fetchAPI<AlertAudit[]>(`/alerts/${id}/audit`),
  getDetectionMetrics: (region?: string) => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    const qs = params.toString();
    return fetchAPI<DetectionMetrics>(`/detection/metrics${qs ? `?${qs}` : ""}`);
  },
  updateAlert: (id: string, status: string) =>
    fetchAPI(`/alerts/${id}?status=${status}`, { method: "PATCH" }),
  getGeofences: () => fetchAPI<Geofence[]>("/geofences"),
  getTimeline: () => fetchAPI<Timeline>("/scenario/timeline"),
  createVerificationRequest: (alertId: string, vesselId: string, assetType = "camera") =>
    fetchAPI<VerificationRequest>("/verification-requests", {
      method: "POST",
      body: JSON.stringify({ alert_id: alertId, vessel_id: vesselId, asset_type: assetType }),
    }),
  getVerificationRequest: (id: string) =>
    fetchAPI<VerificationRequest>(`/verification-requests/${id}`),
  getIngestionStatus: () => fetchAPI<IngestionStatus>("/ingestion/status"),
};
