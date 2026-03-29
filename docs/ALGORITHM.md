# HarborOS — Algorithm & Scoring Reference

How HarborOS detects anomalies, scores risk, and recommends operator actions.

## Pipeline Overview

```
Position Reports → Anomaly Detectors → Signal Aggregation → Fuzzy Inference → Risk Score → MARSEC Action
                        ↑                      ↑                   ↑
                  Vessel Profiles        Signal Weights       Rule Base
                  (type-aware           (defense-priority    (Mamdani fuzzy
                   thresholds)           weighting)           logic engine)
```

1. **Anomaly Detection** — 10 detectors scan position history for suspicious behavior patterns
2. **Signal Aggregation** — Detected signals are weighted by defense relevance and combined into a 0–1 composite severity
3. **Fuzzy Risk Inference** — Composite severity + metadata gaps + inspection history feed a Mamdani fuzzy logic engine
4. **MARSEC Classification** — The 0–100 risk score maps to an ISPS-aligned action recommendation

## Anomaly Detectors

Each detector takes a vessel's position history and returns zero or more anomaly signals with a severity (0–1) and human-readable description.

### Loitering Detection
**Method**: F(c) course-change intensity formula (PMC 2023, 97% accuracy)

```
F(c) = (Σ|ΔCourse| × Σ Speed) / (180° × BoundingBoxArea)
```

- Anchor exclusion: bbox < 0.17 nm² AND avg speed < 3 kt → not flagged
- Minimum window: 5 position reports, 5+ minutes
- F(c) threshold: 50 (below = normal maneuvering)
- Severity: `0.15 + log10(F(c)) × 0.10`, scaled by vessel type multiplier
- Weather: suppressed entirely in fog (visibility < 2 nm)

### AIS Gap Detection
**Method**: IMO speed-dependent reporting intervals (Resolution A.1106(29))

| Speed | IMO Mandated Interval | Alert Threshold |
|-------|----------------------|-----------------|
| < 3 kt (anchor) | 3 min | 15 min |
| 3–14 kt | 10 sec (3.3 turning) | 6 min |
| 14–23 kt | 6 sec (2 turning) | 4 min |
| > 23 kt | 2 sec | 3 min |

- Severity scales with gap ratio: `0.15 + log1p(gap_ratio / 100) × 0.15`
- Fast vessel boost: 15% severity increase for vessels > 14 kt
- Gap ratio = actual gap seconds / IMO expected interval

### Dark Vessel Detection
**Method**: Speed-aware silence detection (Global Fishing Watch methodology)

- Dark threshold: 2.5× the speed-dependent gap threshold
- Requires 3+ regular transmissions before silence (confirms vessel was actively reporting)
- Severity: `0.25 + (minutes_dark / 60) × 0.15`
- Speed boost: +15% for > 14 kt, +10% for > 5 kt

### Geofence Breach
- Checks last 10 positions against restricted/security/environmental zones
- Ray-casting point-in-polygon test
- Severity factors: zone severity (high/normal) × vessel type multiplier × breach depth × speed
- Breach depth: ratio of positions inside zone (0.46 at 1/10 to 1.0 at all inside)

### Zone Lingering
- Flags vessels spending > 20 minutes inside security/restricted zones
- Severity: `0.3 + (minutes_in_zone / 120)`, capped at 0.60

### Kinematic Implausibility (Spoofing Detection)
- Cross-checks position jumps against physical constraints
- Implied speed > 50 kt between consecutive reports = impossible jump
- Jumps > 10 nm flagged as data error (severity capped at 0.40)
- 3+ jumps → "possible position spoofing"

### Speed Anomaly
- Detects rapid acceleration/deceleration beyond vessel type threshold
- Thresholds by type: cargo/tanker 3 kt, fishing 5 kt, tug 8 kt, military 15 kt
- Weather adjustment: threshold widened 50% in heavy weather (wind > 25 kt)
- Learned baseline comparison: z-score > 2.5 vs regional mean triggers signal
- Speeds > 50 kt capped as likely data error

### Heading Anomaly
- Flags excessive course changes for underway vessels (avg speed > 2 kt)
- Turn threshold varies by type: cargo 30°, fishing 60°, tug 75°, military 45°
- Requires 5+ large turns to trigger
- Weather: threshold widened 30% in heavy weather

### Statistical Outlier
- Compares vessel behavior against regional fleet statistics
- Combined deviation: `(speed_z × 0.6) + (heading_excess × 0.4)`
- Only penalizes above-normal heading variance (below-normal = calm vessel)
- Threshold: combined deviation > 1.0

### Collision Risk (COLREGS Non-Compliance)
**Method**: Mou et al. 2021 exponential CPA formula with F_angle

```
CR = exp(-DCPA / 1.5) × exp(-TCPA / 12) × F_angle_adjusted
```

- F_angle: encounter geometry multiplier (head-on 1.0, crossing up to 8.5, overtaking 2.34)
- Flags vessels maintaining course into close encounters instead of maneuvering per COLREGS
- Actively maneuvering vessels (> 8° avg heading change) get severity reduced 50%
- Weather: sensitivity increased in low visibility (< 2 nm)

## Vessel Type Profiles

Detectors adjust thresholds based on vessel type — what's normal for a fishing boat is suspicious for a cargo ship.

| Type | Loiter Tolerance | Turn Threshold | Speed Δ Threshold | Zone Multiplier |
|------|-----------------|----------------|-------------------|-----------------|
| Cargo | 15 min | 30° | 3 kt | 1.2× |
| Tanker | 25 min | 25° | 3 kt | 1.0× |
| Fishing | 120 min | 60° | 5 kt | 1.5× |
| Tug | 60 min | 75° | 8 kt | 0.3× |
| Passenger | 20 min | 30° | 4 kt | 1.0× |
| Military | 60 min | 45° | 15 kt | 0.3× |
| High Speed | 10 min | 40° | 10 kt | 1.0× |

## Signal Aggregation

Signals are weighted by defense relevance before combining:

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Dark Ship (Optical) | 1.00 | No AIS at all — highest threat |
| AIS Gap | 1.00 | Core MDA signal — vessels going dark |
| Kinematic Implausibility | 0.95 | GPS spoofing indicator |
| Geofence Breach | 0.90 | Interdiction trigger |
| Type Mismatch | 0.85 | Identity deception |
| Route Deviation | 0.80 | Sanctions evasion, smuggling |
| Loitering | 0.75 | Surveillance, rendezvous |
| Zone Lingering | 0.70 | Infrastructure proximity |
| Speed Anomaly | 0.60 | Evasive maneuvering |
| Heading Anomaly | 0.55 | Search patterns, evasion |
| Statistical Outlier | 0.50 | Fleet behavioral deviation |
| Collision Risk | 0.40 | COLREGS non-compliance |

**Aggregation formula**:
- Per signal type: take max severity × weight (diminishing returns for repeat signals: +0.03 per extra)
- Diversity bonus: 2 distinct types → 8% boost, 3+ types → 18% boost
- Normalize to 0–1: `composite = min(1.0, total / 3.5)`

The divisor (3.5) is calibrated so escalation requires multiple strong defense-relevant signals converging. A single moderate signal alone produces a negligible composite.

## Fuzzy Risk Inference

### Inputs (0–1 each)
1. **Anomaly severity** — composite from signal aggregation
2. **Metadata deficiency** — weighted missing fields (IMO 30%, flag 25%, callsign 20%, name 15%, destination 10%)
3. **Inspection risk** — `min(1.0, deficiency_count / 5)`

### Fuzzy Sets

**Anomaly severity**: negligible (0–0.18), low (0.10–0.40), medium (0.30–0.70), high (0.60–0.90), critical (0.82–1.0)

**Metadata**: complete (0–0.25), partial (0.15–0.65), poor (0.55–1.0)

**Inspection**: clean (0–0.3), moderate (0.2–0.7), poor (0.6–1.0)

### Rule Base (16 rules)
Key principle: anomaly severity drives risk. Metadata and inspection gaps amplify but don't create risk alone.

| Anomaly | Metadata | Inspection | → Risk |
|---------|----------|------------|--------|
| negligible | complete | clean | safe |
| negligible | any | any | safe |
| low | any | any | low |
| low | poor | any | medium |
| medium | any | any | medium |
| medium | poor | any | high |
| medium | any | poor | high |
| high | any | any | high |
| high | poor | any | critical |
| critical | any | any | critical |
| negligible | poor | poor | medium |
| low | poor | poor | high |

### Defuzzification
Blended centroid + weighted mean of maxima (60/40 split):
- **Centroid**: standard Mamdani area-based defuzzification over 200-point resolution
- **WMoM**: set peaks weighted by activation strength (safe=2.5, low=20, medium=52, high=78, critical=97.5)
- **Spread**: ±15% perturbation proportional to raw anomaly severity to break centroid plateaus

## MARSEC Action Thresholds

| Score | Action | MARSEC Level | Meaning |
|-------|--------|-------------|---------|
| 80–100 | ESCALATE | MARSEC 3 | Immediate interdiction response |
| 60–79 | VERIFY | MARSEC 2 | Request satellite/asset verification |
| 35–59 | MONITOR | MARSEC 1 | Track vessel, log activity |
| 0–34 | NORMAL | Below MARSEC 1 | No action needed |

## References

- Loitering: "Loitering Behavior Detection by Spatiotemporal Characteristics" (PMC 2023)
- AIS intervals: IMO Resolution A.1106(29), ITU-R M.1371
- Collision risk: Mou et al. 2021, exponential CPA with F_angle geometry
- Dark vessels: Global Fishing Watch (55,000+ deliberate AIS disabling events/year)
- Anomaly survey: Stach et al. 2023 maritime anomaly detection survey
- MARSEC levels: ISPS Code (International Ship and Port Facility Security)
