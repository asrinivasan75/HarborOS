# HarborOS Scoring & Detection Methodology

A comprehensive technical reference covering the anomaly detection pipeline, risk scoring engine, and academic foundations behind HarborOS.

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Anomaly Detection Layer](#2-anomaly-detection-layer)
   - 2.1 [Geofence Breach](#21-geofence-breach-detection)
   - 2.2 [Loitering](#22-loitering-detection)
   - 2.3 [Speed Anomaly](#23-speed-anomaly-detection)
   - 2.4 [Heading Anomaly](#24-heading-anomaly-detection)
   - 2.5 [AIS Gap](#25-ais-gap-detection)
   - 2.6 [Dark Vessel](#26-dark-vessel-detection)
   - 2.7 [Zone Lingering](#27-zone-lingering-detection)
   - 2.8 [Kinematic Implausibility](#28-kinematic-implausibility-detection)
   - 2.9 [Statistical Outlier](#29-statistical-outlier-detection)
   - 2.10 [Collision Risk](#210-collision-risk-detection)
   - 2.11 [Route Deviation](#211-route-deviation-detection)
   - 2.12 [Type Mismatch](#212-type-mismatch-detection)
3. [Vessel Type Behavior Profiles](#3-vessel-type-behavior-profiles)
4. [Risk Scoring Engine](#4-risk-scoring-engine)
   - 4.1 [Signal Aggregation](#41-signal-aggregation)
   - 4.2 [Metadata Deficiency](#42-metadata-deficiency-scoring)
   - 4.3 [Inspection Risk](#43-inspection-risk-scoring)
   - 4.4 [Fuzzy Logic Inference](#44-fuzzy-logic-inference-engine)
   - 4.5 [Defuzzification](#45-defuzzification)
   - 4.6 [MARSEC Action Mapping](#46-marsec-action-mapping)
5. [Learned Baselines & Pattern Learning](#5-learned-baselines--pattern-learning)
6. [Academic Sources & Standards](#6-academic-sources--standards)
7. [Complete Threshold Reference](#7-complete-threshold-reference)

---

## 1. Pipeline Overview

HarborOS processes vessel data through three sequential layers:

```
AIS Position Data
       |
       v
 ┌─────────────────────────────────────────────┐
 │  LAYER 1: Anomaly Detection                 │
 │  12 independent detector functions           │
 │  Each returns signals with severity (0-1)    │
 │  Vessel-type-aware via behavior profiles     │
 └──────────────────┬──────────────────────────┘
                    |  list[AnomalySignalSchema]
                    v
 ┌─────────────────────────────────────────────┐
 │  LAYER 2: Risk Scoring                      │
 │  Weighted signal aggregation → 0-1 composite │
 │  + metadata deficiency (0-1)                 │
 │  + inspection risk (0-1)                     │
 │  → Fuzzy logic inference → 0-100 score       │
 └──────────────────┬──────────────────────────┘
                    |  RiskAssessmentSchema
                    v
 ┌─────────────────────────────────────────────┐
 │  LAYER 3: Alert Generation                  │
 │  Score → MARSEC action recommendation        │
 │  Create/update AlertORM with explanation     │
 │  Operator feedback loop                      │
 └─────────────────────────────────────────────┘
```

**Key files:**
- `backend/app/services/anomaly_detection.py` — Layer 1
- `backend/app/services/risk_scoring.py` — Layer 2 (signal weights, fuzzy engine)
- `backend/app/services/alert_service.py` — Layer 3
- `backend/app/services/vessel_profiles.py` — Per-type thresholds
- `backend/app/services/pattern_learning.py` — Historical baselines

---

## 2. Anomaly Detection Layer

Each detector is a standalone function with the signature:

```python
def detect_X(vessel, positions, geofences=None, **kwargs) -> list[AnomalySignalSchema]
```

All detectors run independently against every vessel during each detection cycle. The `run_anomaly_detection()` function orchestrates them.

### 2.1 Geofence Breach Detection

**Purpose:** Flag vessels that have entered restricted, security, or environmental zones.

**Algorithm:**
1. For each geofence of type `restricted`, `security`, or `environmental`, parse the GeoJSON polygon.
2. Test the last 10 positions against the polygon using ray-casting point-in-polygon.
3. If any position is inside, compute severity.

**Severity calculation:**
```
base_severity  = 0.9  (if geofence severity == "high")
               = 0.6  (otherwise)

depth_factor   = 0.4 + 0.6 * (positions_inside / positions_checked)
                 Range: 0.46 (1 position inside) to 1.0 (all inside)

speed_factor   = 0.5 + 0.5 * min(latest_speed / 15.0, 1.0)
                 Range: 0.5 (stationary) to 1.0 (moving ≥15 kt)

final_severity = min(0.65, base_severity * zone_mult * depth_factor * speed_factor)
```

The `zone_mult` comes from the vessel's type profile (see Section 3). Tugs near restricted zones are expected (`zone_severity_mult = 0.5`); cargo ships are not (`zone_severity_mult = 1.2`).

**Trigger condition:** ≥1 of the last 10 positions inside a restricted/security/environmental geofence.

### 2.2 Loitering Detection

**Purpose:** Detect vessels exhibiting movement with frequent course changes within a confined area — distinct from anchoring.

**Academic basis:** Spatiotemporal loitering detection using the F(c) course-change intensity formula (PMC 2023). 97% overall accuracy, 92% F-score across 137 test trajectories.

**Algorithm:**
1. Take the last 30 positions.
2. Compute the F(c) course-change intensity:

```
F(c) = (Σ|ΔCourse| × Σ Speed) / (180° × BoundingBoxArea)
```

Where:
- `Σ|ΔCourse|` = sum of absolute course changes between consecutive positions
- `Σ Speed` = sum of all SOG values
- `BoundingBoxArea` = area of the bounding box enclosing all positions (in nm²)
- `180°` = normalization constant

3. **Anchor exclusion:** If bounding box < 0.17 nm² AND average speed < 3 kt, the vessel is anchored, not loitering. Skip.
4. Require `time_span ≥ 5 minutes` and `F(c) ≥ 50`.

**Severity calculation:**
```
base_severity = min(0.55, 0.15 + log10(max(fc, 1)) * 0.10)
severity      = min(0.65, base_severity * loiter_severity_mult)
```

The `loiter_severity_mult` from the vessel profile dramatically changes the output: fishing boats (`0.25`) are expected to loiter; passenger vessels (`1.3`) are not.

**Source:** [Loitering Behavior Detection by Spatiotemporal Characteristics](https://pmc.ncbi.nlm.nih.gov/articles/PMC10557514/) (PMC, 2023)

### 2.3 Speed Anomaly Detection

**Purpose:** Detect unusual rapid acceleration/deceleration events.

**Algorithm:**
1. Extract all (timestamp, SOG) pairs.
2. Count consecutive speed changes exceeding the type-specific `speed_delta_threshold`.
3. Require ≥2 rapid changes to trigger.

**Severity calculation:**
```
change_factor = min(1.0, max_change / 30) * 0.08
severity      = min(0.65, 0.18 + (large_changes * 0.06) + change_factor)
```

**Special case:** If `max_change > 50 kt`, this is almost certainly a data error, not a real speed change. Severity is capped at 0.45.

**Learned baseline comparison:** If a `LearnedBaseline` exists for this vessel's region+type, the detector also computes a z-score of the vessel's average speed against the learned mean:
```
z_score = abs(avg_speed - learned_mean) / learned_std
```
If z-score > 2.5, an additional severity contribution is added.

**Type-specific thresholds:**
| Vessel Type | Speed Delta Threshold |
|---|---|
| Cargo | 3 kt |
| Tanker | 3 kt |
| Fishing | 5 kt |
| Tug | 4 kt |
| Passenger | 3 kt |
| Pleasure | 5 kt |
| Military | 8 kt |
| Law Enforcement | 8 kt |

### 2.4 Heading Anomaly Detection

**Purpose:** Detect erratic course changes (circling, evasive maneuvering, search patterns).

**Algorithm:**
1. Extract all COG values. Require ≥5 headings.
2. **Filter:** Only flag if average speed ≥ 2.0 kt (moored vessels swing at anchor and shouldn't be flagged).
3. Count course changes exceeding the type-specific `heading_change_deg` threshold.
4. Require ≥5 large turns to trigger.

**Severity calculation:**
```
turn_intensity = total_turn / len(headings)
base_severity  = min(0.50, 0.10 + (large_turns * 0.035) + (turn_intensity / 180) * 0.12)
severity       = min(0.65, base_severity * heading_severity_mult)
```

**Type-specific thresholds:**
| Vessel Type | "Large Turn" Threshold | Severity Multiplier |
|---|---|---|
| Cargo | 30° | 1.0 |
| Tanker | 25° | 1.0 |
| Fishing | 60° | 0.25 |
| Tug | 45° | 0.4 |
| Passenger | 20° | 1.3 |
| Pleasure | 45° | 0.35 |
| Military | 60° | 0.15 |
| Law Enforcement | 60° | 0.15 |

### 2.5 AIS Gap Detection

**Purpose:** Detect gaps in AIS transmission that may indicate intentional "going dark."

**Academic basis:** IMO Resolution A.1106(29) and ITU-R M.1371 define mandatory AIS reporting intervals by vessel speed and maneuver state. Gaps are evaluated against these standards.

**Speed-dependent expected intervals (IMO Class A):**
| Speed | Turning? | Expected Interval |
|---|---|---|
| At anchor / < 3 kt | No | 3 minutes |
| 0-14 kt | No | 10 seconds |
| 0-14 kt | Yes | 3.3 seconds |
| 14-23 kt | No | 6 seconds |
| 14-23 kt | Yes | 2 seconds |
| > 23 kt | — | 2 seconds |

**Alert thresholds (speed-dependent):**
| Speed | Gap Threshold |
|---|---|
| < 3 kt (anchored) | 15 minutes |
| 3-14 kt | 6 minutes |
| 14-23 kt | 4 minutes |
| > 23 kt | 3 minutes |

**Severity calculation:**
```
gap_ratio = actual_gap_seconds / expected_interval_seconds
severity  = min(0.55, 0.15 + log1p(gap_ratio / 100) * 0.15)
```
If vessel speed > 14 kt, multiply severity by 1.15 (fast vessels missing reports is more alarming).

**Sources:**
- [USCG AIS Requirements](https://www.navcen.uscg.gov/ais-requirements)
- [Comar Systems AIS Reporting Intervals](https://comarsystems.com/support-hub/what-are-ais-reporting-intervals/)

### 2.6 Dark Vessel Detection

**Purpose:** Detect vessels that have stopped transmitting AIS entirely — distinct from gap detection, which finds gaps *within* a track.

**Academic basis:** Global Fishing Watch analysis of 28 billion AIS signals (2017-2019) identified 55,000+ deliberate AIS disabling events, accounting for ~6% of all global fishing activity and ~1.6 million hours/year of untracked movement.

**Algorithm:**
1. Require ≥4 historical positions.
2. Compute `minutes_since_last_report` against current time.
3. Compute dark threshold = `2.5 × speed_gap_threshold` for the vessel's last known speed.
4. Verify the vessel was transmitting regularly before going dark (≥3 consecutive intervals below the expected threshold).

**Severity calculation:**
```
base_severity = min(0.55, 0.25 + (minutes_since_last / 60) * 0.15)

if last_speed > 14 kt:
    severity = min(0.65, base_severity * 1.15)
elif last_speed > 5 kt:
    severity = min(0.60, base_severity * 1.1)
```

**Sources:**
- [Global Fishing Watch — When fishing boats go dark](https://theconversation.com/when-fishing-boats-go-dark-at-sea-theyre-often-committing-crimes-we-mapped-where-it-happens-196694)
- [NOAA — Dark Fishing Vessel Activities](https://www.fisheries.noaa.gov/feature-story/learning-more-about-dark-fishing-vessels-activities-sea)
- [Cambridge Core — Illegality of Fishing Vessels Going Dark](https://www.cambridge.org/core/journals/international-and-comparative-law-quarterly/article/illegality-of-fishing-vessels-going-dark-and-methods-of-deterrence/8E5D5C30A15C91BF17423ED1EF6EE0E2)

### 2.7 Zone Lingering Detection

**Purpose:** Flag vessels spending excessive time in a security or restricted zone without apparent purpose.

**Algorithm:**
1. For each `security` or `restricted` geofence, compute how many positions fall inside.
2. Require ≥3 positions inside.
3. Compute `time_in_zone` from earliest to latest in-zone position.
4. Trigger if time_in_zone > 20 minutes.

**Severity calculation:**
```
severity = min(0.60, 0.3 + (time_in_zone / 120))
```

Scales linearly with duration. 20 minutes → severity 0.47. 60 minutes → severity 0.60 (cap).

### 2.8 Kinematic Implausibility Detection

**Purpose:** Detect physically impossible position jumps or speed values that indicate GPS spoofing, equipment malfunction, or data corruption.

**Algorithm:**
1. For consecutive position pairs, compute implied speed from haversine distance / time delta.
2. Flag if implied speed > 50 kt (absolute maximum for any vessel).
3. Also flag if reported SOG > 50 kt.

**Severity calculation:**
```
jump_factor = min(1.0, max_jump_nm / 20) * 0.06
severity    = min(0.55, 0.20 + (impossible_jumps * 0.06) + jump_factor)
```

**Special handling:**
- If `max_jump > 10 nm`: severity capped at 0.40 and labeled "almost certainly data error" (not spoofing).
- If `impossible_jumps ≥ 3`: labeled "possible position spoofing or severe equipment malfunction."

### 2.9 Statistical Outlier Detection

**Purpose:** Detect vessels whose behavior deviates from the regional fleet average using z-score analysis.

**Academic basis:** Inspired by encoder-decoder outlier detection (arxiv 2024). That paper uses 6-sigma thresholds on neural network reconstruction error. HarborOS uses a simpler z-score approach with similar intent.

**Algorithm:**
1. Require ≥5 positions and pre-computed regional stats.
2. Compute the vessel's mean speed and speed variance.
3. Z-score the vessel's speed standard deviation against the regional fleet's:

```
speed_z = |√(vessel_speed_var) - regional_speed_std| / regional_speed_std
```

4. Compute heading variance ratio (only penalize *above-normal* variability):

```
heading_ratio = vessel_heading_var / regional_heading_var
heading_excess = max(0, heading_ratio - 1.5)
```

5. Combined deviation score:

```
deviation = (speed_z * 0.6) + (heading_excess * 0.4)
```

6. Trigger if `deviation ≥ 1.0`.

**Severity:** `min(0.65, 0.25 + deviation * 0.15)`

**Source:** [Outlier Detection in Maritime Environments Using Deep Learning](https://arxiv.org/html/2406.09966v1) (arxiv, 2024)

### 2.10 Collision Risk Detection

**Purpose:** Detect close approach and collision risk using CPA/TCPA analysis with COLREGS encounter classification.

**Academic basis:** Mou et al. 2021 quantitative collision risk formula with smooth angular transitions and encounter-type multipliers. Improves on the original 2010 formula by eliminating false risk spikes at encounter-type boundary angles.

**Algorithm:**

**Step 1 — Candidate filtering:**
- Both vessels must be moving (SOG > 2 kt).
- Distance must be < 1.5 nm.

**Step 2 — CPA/TCPA computation:**
```
# Velocity decomposition
v1_x = speed₁ × sin(course₁)    v1_y = speed₁ × cos(course₁)
v2_x = speed₂ × sin(course₂)    v2_y = speed₂ × cos(course₂)

# Relative position (degrees → nautical miles)
dx = (lon₂ - lon₁) × 60 × cos(lat₁)
dy = (lat₂ - lat₁) × 60

# Relative velocity
dvx = v2_x - v1_x
dvy = v2_y - v1_y

# Time to Closest Point of Approach
TCPA = -(dx × dvx + dy × dvy) / (dvx² + dvy²)

# Distance at Closest Point of Approach
DCPA = √((dx + dvx × TCPA)² + (dy + dvy × TCPA)²)
```

**Step 3 — Base collision risk (Mou et al. 2021):**
```
CR_base = exp(-DCPA / a) × exp(-TCPA_min / b)
```
Where `a = 1.5` (distance scaling, nm) and `b = 12.0` (time scaling, minutes).

**Step 4 — Encounter type classification with smooth transitions:**

| Relative Bearing | Encounter Type | F_angle |
|---|---|---|
| 0-45° | Head-on | 1.0 |
| 45-60° | Transition zone | Smooth ramp (cosine interpolation) |
| 60-150° | Crossing | `1.5 + 7.0 × max(0, 1 - (\|bearing - 90°\| / 60)^1.5)` — peaks at 8.5 at 90° |
| 150-165° | Transition zone | Smooth ramp (cosine interpolation) |
| 165-180° | Overtaking | 2.34 |

The crossing encounter peaks at F_angle = 8.5 at exactly 90° (beam crossing), which is the most dangerous COLREGS scenario due to give-way confusion.

**Step 5 — Adjusted collision risk:**
```
f_adjusted = 1.0 + ln(max(F_angle, 1.0)) / ln(8.5)
CR = min(1.0, CR_base × f_adjusted)
severity = min(0.65, CR × 0.65)
```

**Step 6 — COLREGS compliance adjustment:**
```
heading_stability = average(|heading[i] - heading[i-1]|) for recent positions

if heading_stability > 8.0°:
    # Vessel is actively maneuvering (COLREGS-compliant avoidance)
    severity *= 0.25

elif heading_stability < 3.0°:
    # Dead-steady approach with no avoidance — suspicious
    severity = min(0.65, severity * 1.3)
```

**Trigger conditions:** `CR ≥ 0.25`, `TCPA ∈ [0, 30 minutes]`, distance < 1.5 nm.

**Sources:**
- [Mou et al. — Quantitative Collision Risk Calculation](https://academic.oup.com/jcde/article/8/3/894/6275214) (Oxford Academic, 2021)
- [COLREGS Rules 13 (Overtaking), 14 (Head-on), 15 (Crossing)](https://www.imo.org/en/About/Conventions/Pages/COLREG.aspx)

### 2.11 Route Deviation Detection

**Purpose:** Flag vessels that have deviated from historically learned traffic corridors.

**Algorithm:**
1. Requires a `LearnedBaseline` with position density grids (see Section 5).
2. Check the last 5 positions against the corridor grid.
3. A position is "off-corridor" if it's > 5 grid cells (~5.5 km) from any known traffic cell.
4. Require ≥2 of 5 positions to be off-corridor.

**Severity:** `min(0.60, 0.2 + (off_count / total) * 0.3 + (max_dist / 20) * 0.08)`

### 2.12 Type Mismatch Detection

**Purpose:** Detect when a vessel's observed behavior contradicts its declared vessel type (e.g., a "cargo" vessel moving in fishing patterns).

**Academic basis:** PMC 2022 study of 62 million AIS messages showing that behavioral features (speed patterns, voyage distance, movement range) achieve 92.7% classification accuracy vs 73.1% from dimensions alone.

**Checks performed:**
1. **Speed mismatch:** Average speed significantly outside the expected range for the declared type. Vessels at anchor (< 3 kt) are explicitly excluded — being slow doesn't mean you're the wrong type.
   - Trigger: `avg_speed < expected_lo * 0.5` (and `avg_speed ≥ 3.0`) OR `avg_speed > expected_hi * 1.5`

2. **Heading variance mismatch:**
   - Cargo/tanker/passenger with `avg_heading_change > 40°` → flagged (should maintain steady course)
   - Fishing vessel with `avg_heading_change < 5°` at `avg_speed > 10 kt` → flagged (should be erratic during fishing)

**Severity:** `min(0.55, 0.18 + mismatch_count * 0.12 + speed_deviation * 0.08)`

**Source:** [Ship Classification and Anomaly Detection Based on AIS](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611351/) (PMC, 2022)

---

## 3. Vessel Type Behavior Profiles

Each vessel type has a profile defining "normal" operating parameters. Detectors use these to adjust thresholds and severity multipliers.

| Parameter | Cargo | Tanker | Fishing | Tug | Passenger | Pleasure | Military | Law Enf. |
|---|---|---|---|---|---|---|---|---|
| **Speed range (kt)** | 5-18 | 4-16 | 0-12 | 0-14 | 8-25 | 0-20 | 0-35 | 0-30 |
| **Typical speed (kt)** | 12 | 10 | 5 | 6 | 18 | 8 | 15 | 12 |
| **Loiter tolerance (min)** | 15 | 25 | 120 | 60 | 10 | 60 | 90 | 90 |
| **Loiter severity mult** | 1.0 | 0.8 | **0.25** | 0.3 | **1.3** | 0.4 | 0.15 | 0.15 |
| **Large turn threshold (°)** | 30 | 25 | 60 | 45 | 20 | 45 | 60 | 60 |
| **Heading severity mult** | 1.0 | 1.0 | **0.25** | 0.4 | **1.3** | 0.35 | 0.15 | 0.15 |
| **AIS gap tolerance (min)** | 10 | 10 | 30 | 15 | 5 | 30 | 60 | 30 |
| **Zone severity mult** | 1.2 | 1.0 | **1.5** | **0.5** | 1.3 | 1.0 | 0.2 | 0.15 |
| **Speed delta threshold (kt)** | 3 | 3 | 5 | 4 | 3 | 5 | 8 | 8 |

**Key design decisions:**
- **Fishing boats** get 75% severity reduction for loitering and heading changes (these are normal fishing behavior), but a 50% *increase* for zone breaches (they shouldn't be in restricted areas).
- **Military/law enforcement** get 85% severity reduction across the board (authorized to operate freely in restricted zones, maintain radio silence, etc.).
- **Passenger vessels** get 30% severity *increases* for loitering, heading anomalies, and zone breaches (they should be on predictable schedules).
- **Tugs** get reduced zone severity (they work inside harbors by definition).

Unknown vessel types fall back to a default profile with moderate thresholds.

---

## 4. Risk Scoring Engine

### 4.1 Signal Aggregation

All anomaly signals from Layer 1 are aggregated into a single composite severity (0-1) using defense-prioritized weights:

| Signal Type | Weight | Rationale |
|---|---|---|
| Dark Ship (Optical) | 1.00 | No AIS at all — highest threat indicator |
| AIS Gap | 1.00 | Intentional "going dark" — core MDA signal |
| Kinematic Implausibility | 0.95 | GPS spoofing indicator |
| Geofence Breach | 0.90 | Restricted zone violation — interdiction trigger |
| Type Mismatch | 0.85 | Identity deception (smuggling, disguise) |
| Route Deviation | 0.80 | Off-corridor — sanctions evasion, smuggling |
| Loitering | 0.75 | Surveillance, rendezvous, drop-off |
| Zone Lingering | 0.70 | Critical infrastructure proximity |
| Speed Anomaly | 0.60 | Evasive maneuvering |
| Heading Anomaly | 0.55 | Search patterns, evasion |
| Statistical Outlier | 0.50 | Behavioral anomaly vs fleet |
| Collision Risk | 0.40 | COLREGS non-compliance (defense reframe) |

**Aggregation formula:**

```
For each anomaly type with signals:
    contribution = weight × max(severities)
    + min(extra_signals, 2) × 0.03          # Diminishing returns for repeats

total = sum of all contributions

Diversity bonus:
    2 distinct types → total × 1.08
    3+ distinct types → total × 1.18

composite = min(1.0, total / 3.5)
```

The divisor of 3.5 is calibrated so that a single moderate signal produces a negligible composite (a 0.3-severity signal with weight 0.75 → composite ~0.06), while escalation requires multiple strong converging signals to push past 0.7.

### 4.2 Metadata Deficiency Scoring

Weighted by maritime security importance per ISPS/SOLAS:

| Field | Weight | Rationale |
|---|---|---|
| IMO Number | 0.30 | Critical unique identifier — never changes for a vessel's lifetime |
| Flag State | 0.25 | Jurisdictional authority — determines boarding/inspection rights |
| Callsign | 0.20 | Radio communication identifier |
| Vessel Name | 0.15 | Primary visual identifier |
| Destination | 0.10 | Common for local traffic to omit |

**Output:** 0.0 (all fields present) to 1.0 (all fields missing/unknown).

### 4.3 Inspection Risk Scoring

```
inspection_risk = min(1.0, deficiency_count / 5)
```

5 or more Port State Control deficiencies = maximum inspection risk (1.0).

### 4.4 Fuzzy Logic Inference Engine

The three inputs (anomaly composite, metadata deficiency, inspection risk) feed into a Mamdani-type fuzzy inference system using trapezoidal/triangular membership functions.

**Academic basis:** ANFIS (Adaptive Neuro-Fuzzy Inference Systems) approach for handling uncertainty — fuzzy rules handle the inherent imprecision of maritime anomaly signals better than hard thresholds.

#### Input Membership Functions

**Anomaly Severity (0-1):**

| Fuzzy Set | Shape | Parameters | Description |
|---|---|---|---|
| Negligible | Trapezoid | (0, 0, 0.08, 0.18) | Full membership 0-0.08, ramp to 0 at 0.18 |
| Low | Triangle | (0.10, 0.25, 0.40) | Peak at 0.25 |
| Medium | Triangle | (0.30, 0.50, 0.70) | Peak at 0.50 |
| High | Triangle | (0.60, 0.78, 0.90) | Peak at 0.78 |
| Critical | Trapezoid | (0.82, 0.92, 1.0, 1.0) | Full membership 0.92-1.0 |

**Metadata Deficiency (0-1):**

| Fuzzy Set | Shape | Parameters |
|---|---|---|
| Complete | Trapezoid | (0, 0, 0.1, 0.25) |
| Partial | Triangle | (0.15, 0.40, 0.65) |
| Poor | Trapezoid | (0.55, 0.75, 1.0, 1.0) |

**Inspection Risk (0-1):**

| Fuzzy Set | Shape | Parameters |
|---|---|---|
| Clean | Trapezoid | (0, 0, 0.1, 0.3) |
| Moderate | Triangle | (0.2, 0.45, 0.7) |
| Poor | Trapezoid | (0.6, 0.8, 1.0, 1.0) |

#### Output Membership Functions

**Risk Score (0-100):**

| Fuzzy Set | Shape | Parameters | Peak Position |
|---|---|---|---|
| Safe | Trapezoid | (0, 0, 5, 12) | 2.5 |
| Low | Triangle | (8, 20, 42) | 20.0 |
| Medium | Triangle | (35, 52, 70) | 52.0 |
| High | Triangle | (62, 78, 92) | 78.0 |
| Critical | Trapezoid | (85, 95, 100, 100) | 97.5 |

Design note: Sets are wide and well-separated so centroid defuzzification produces a continuous score spread. Narrow or overlapping sets cause attractor plateaus where different inputs collapse to the same output.

#### Fuzzy Rule Base (16 rules)

| # | Anomaly | Metadata | Inspection | → Risk Output |
|---|---|---|---|---|
| 1 | Negligible | Complete | Clean | **Safe** |
| 2 | Negligible | Complete | — | **Safe** |
| 3 | Negligible | Partial | — | **Safe** |
| 4 | Negligible | Poor | — | **Safe** |
| 5 | Low | — | — | **Low** |
| 6 | Low | Poor | — | **Medium** |
| 7 | Medium | — | — | **Medium** |
| 8 | Medium | Poor | — | **High** |
| 9 | Medium | — | Poor | **High** |
| 10 | High | — | — | **High** |
| 11 | High | Poor | — | **Critical** |
| 12 | High | — | Poor | **Critical** |
| 13 | Critical | — | — | **Critical** |
| 14 | Negligible | Poor | Poor | **Medium** |
| 15 | Low | Partial | Moderate | **Medium** |
| 16 | Low | Poor | Poor | **High** |

`—` means "any" (wildcard). Rules 14-16 are "profile boost" rules that escalate vessels with suspicious metadata/inspection records even when anomaly signals are low.

**Source:** [ANFIS Collision Risk Inference](https://www.astesj.com/v04/i04/p19/) (ASTESJ), [Fuzzy Logic Collision Risk Assessment](https://www.researchgate.net/figure/Reasoning-rules-of-DCPA-TCPA-and-basic-collision-risk_tbl1_343344585) (ResearchGate)

### 4.5 Defuzzification

Uses a blended approach: 60% standard Mamdani centroid + 40% Weighted Mean of Maxima (WMoM).

```
centroid = standard Mamdani centroid (weighted average x-position under fuzzy output curve)

wmom = Σ(set_peak × activation_strength) / Σ(activation_strength)

base_score = 0.6 × centroid + 0.4 × wmom
```

**Why blending?** Pure centroid creates attractor plateaus — when only one output set fires, the centroid always converges to roughly the same value regardless of how strongly the rule activated. Blending with WMoM breaks these plateaus and produces a continuous score spread.

**Input-proportional spread:**
After defuzzification, a small perturbation is applied based on raw anomaly severity to further distribute scores within each MARSEC band:

```
spread = (anomaly_severity - 0.15) × 0.3 × base_score
final_score = clamp(base_score + spread, 0, 100)
```

This ensures that two vessels in the same fuzzy band but with different raw severities don't land on the exact same score.

### 4.6 MARSEC Action Mapping

The final score maps to ISPS Code MARSEC security levels:

| Score Range | Action | MARSEC Level | Description |
|---|---|---|---|
| 0-19 | **IGNORE** | Below MARSEC 1 | Normal traffic — no action needed |
| 20-49 | **MONITOR** | MARSEC 1 (elevated) | Track vessel and log activity |
| 50-74 | **VERIFY** | MARSEC 2 (heightened) | Dispatch verification asset (camera, drone, patrol) to confirm identity and intent |
| 75-100 | **ESCALATE** | MARSEC 3 (exceptional) | Immediate interdiction response required. Consider area restriction and asset deployment |

**Source:** [IMO SOLAS Chapter XI-2 / ISPS Code](https://www.imo.org/en/ourwork/security/pages/solas-xi-2%20isps%20code.aspx), [USCG ISPS/MTSA](https://www.dco.uscg.mil/ISPS-MTSA/)

---

## 5. Learned Baselines & Pattern Learning

The `LearnedBaseline` system (`pattern_learning.py`) builds per-region, per-vessel-type statistical baselines from historical data.

**Data sources (in priority order):**
1. Archived Parquet files (compressed historical positions)
2. Current SQLite data (fallback)

**Computed statistics per region+type:**

| Statistic | Purpose |
|---|---|
| `speed_mean` | Regional average speed for this vessel type |
| `speed_std` | Speed standard deviation (floored at 0.5 to prevent division by near-zero) |
| `speed_p5`, `speed_p95` | 5th/95th percentile speeds |
| `heading_change_mean` | Average course change between consecutive positions |
| `heading_change_std` | Heading change standard deviation (floored at 1.0) |
| `position_corridor` | Grid-cell density map of historical traffic (cells with significant traffic) |
| `sample_count` | Number of records used to compute this baseline |

**Grid resolution:** 0.01° per cell (~1.1 km at equator).

**Corridor definition:** A cell is "on-corridor" if its traffic count is above the 10th percentile. A vessel position is "off-corridor" if it's > 5 grid cells (~5.5 km) from any corridor cell.

These baselines feed into the statistical outlier detector (Section 2.9) and route deviation detector (Section 2.11).

---

## 6. Academic Sources & Standards

### Peer-Reviewed Research

| # | Title | Source | Year | Used In |
|---|---|---|---|---|
| 1 | Quantitative Collision Risk Calculation | Oxford Academic (JCDE) | 2021 | Collision risk (Mou et al. CPA/TCPA formula, F_angle encounter types) |
| 2 | Loitering Behavior Detection by Spatiotemporal Characteristics | PMC | 2023 | Loitering detection (F(c) formula, anchor exclusion, 97% accuracy) |
| 3 | Ship Classification and Anomaly Detection Based on AIS | PMC | 2022 | Type mismatch detection (behavioral features, 92.7% accuracy from 62M messages) |
| 4 | Outlier Detection in Maritime Environments Using Deep Learning | arxiv | 2024 | Statistical outlier detection (6-sigma threshold, encoder-decoder approach) |
| 5 | ANFIS Collision Risk Inference | ASTESJ | — | Fuzzy logic risk scoring (membership functions, rule base design) |
| 6 | Fuzzy Logic Collision Risk Assessment | ResearchGate | — | Fuzzy set design for maritime risk (overlapping ranges rationale) |

### International Standards

| Standard | Authority | Used In |
|---|---|---|
| IMO Resolution A.1106(29) | International Maritime Organization | AIS gap detection (reporting intervals) |
| ITU-R M.1371 | International Telecommunication Union | AIS protocol specification |
| ISPS Code (SOLAS Ch. XI-2) | IMO | MARSEC action levels, metadata importance weights |
| COLREGS | IMO | Collision risk encounter classification (Rules 13, 14, 15) |

### Government Data Sources

| Source | Agency | Used In |
|---|---|---|
| AIS Reporting Requirements | USCG | Speed-dependent gap thresholds |
| Dark Fishing Vessel Analysis | NOAA / Global Fishing Watch | Dark vessel detection design (55K+ events dataset) |
| Port State Control Data | USCG MISLE | Inspection deficiency scoring |

---

## 7. Complete Threshold Reference

### Anomaly Detection Thresholds

| Threshold | Value | Unit | Detector | Source |
|---|---|---|---|---|
| Geofence base severity (high) | 0.9 | — | Geofence breach | HarborOS |
| Geofence base severity (other) | 0.6 | — | Geofence breach | HarborOS |
| Geofence depth factor range | 0.4-1.0 | — | Geofence breach | HarborOS |
| Geofence speed factor range | 0.5-1.0 | — | Geofence breach | HarborOS |
| Loitering F(c) minimum | 50 | — | Loitering | PMC 2023 |
| Loitering time span minimum | 5 | minutes | Loitering | PMC 2023 |
| Loitering anchor exclusion bbox | 0.17 | nm² | Loitering | PMC 2023 |
| Loitering anchor exclusion speed | 3.0 | kt | Loitering | PMC 2023 |
| Heading anomaly min turns | 5 | count | Heading anomaly | HarborOS |
| Heading anomaly min speed | 2.0 | kt | Heading anomaly | HarborOS |
| AIS gap (anchored, < 3 kt) | 15 | minutes | AIS gap | IMO Class A |
| AIS gap (3-14 kt) | 6 | minutes | AIS gap | IMO Class A |
| AIS gap (14-23 kt) | 4 | minutes | AIS gap | IMO Class A |
| AIS gap (> 23 kt) | 3 | minutes | AIS gap | IMO Class A |
| Dark vessel threshold multiplier | 2.5× | × gap threshold | Dark vessel | Global Fishing Watch |
| Dark vessel min regular intervals | 3 | count | Dark vessel | HarborOS |
| Zone lingering time threshold | 20 | minutes | Zone lingering | HarborOS |
| Kinematic max plausible speed | 50 | kt | Kinematic | HarborOS |
| Kinematic "data error" jump | 10 | nm | Kinematic | HarborOS |
| Statistical outlier min deviation | 1.0 | score | Statistical outlier | HarborOS |
| Collision risk detection range | 1.5 | nm | Collision risk | Mou et al. 2021 |
| Collision risk TCPA window | 0-30 | minutes | Collision risk | Mou et al. 2021 |
| Collision risk CR threshold | 0.25 | — | Collision risk | Mou et al. 2021 |
| Collision risk distance scaling (a) | 1.5 | nm | Collision risk | Mou et al. 2021 |
| Collision risk time scaling (b) | 12.0 | minutes | Collision risk | Mou et al. 2021 |
| COLREGS maneuvering threshold | 8.0 | degrees | Collision risk | COLREGS |
| COLREGS steady approach threshold | 3.0 | degrees | Collision risk | COLREGS |
| Route deviation off-corridor distance | 5 | grid cells (~5.5 km) | Route deviation | HarborOS |
| Route deviation min off-corridor | 2 of 5 | positions | Route deviation | HarborOS |
| Type mismatch speed low trigger | < 0.5× expected_lo | — | Type mismatch | PMC 2022 |
| Type mismatch speed high trigger | > 1.5× expected_hi | — | Type mismatch | PMC 2022 |
| Type mismatch heading (cargo/tanker) | > 40° avg change | degrees | Type mismatch | PMC 2022 |
| Type mismatch heading (fishing) | < 5° avg change @ > 10 kt | degrees | Type mismatch | PMC 2022 |
| Speed anomaly data error threshold | 50 | kt delta | Speed anomaly | HarborOS |

### Risk Scoring Thresholds

| Threshold | Value | Context |
|---|---|---|
| Signal aggregation divisor | 3.5 | Normalizes composite to 0-1 |
| Diversity bonus (2 types) | 1.08× | Encourages multi-signal convergence |
| Diversity bonus (3+ types) | 1.18× | Encourages multi-signal convergence |
| Repeat signal bonus | +0.03 per extra (max 2) | Diminishing returns for same-type repeats |
| Metadata IMO weight | 0.30 | Most critical identifier |
| Metadata flag_state weight | 0.25 | Jurisdictional authority |
| Metadata callsign weight | 0.20 | Radio identifier |
| Metadata name weight | 0.15 | Visual identifier |
| Metadata destination weight | 0.10 | Often omitted legitimately |
| Inspection normalization | deficiencies / 5 | 5+ = max risk |
| Defuzzification blend | 60% centroid / 40% WMoM | Breaks centroid plateaus |
| Score spread factor | ±15% of base_score | Input-proportional distribution |
| MARSEC IGNORE | 0-19 | Below MARSEC 1 |
| MARSEC MONITOR | 20-49 | MARSEC 1 (elevated) |
| MARSEC VERIFY | 50-74 | MARSEC 2 (heightened) |
| MARSEC ESCALATE | 75-100 | MARSEC 3 (exceptional) |

### All Severity Caps by Detector

| Detector | Max Severity | Rationale |
|---|---|---|
| Geofence breach | 0.65 | Single zone entry shouldn't dominate |
| Loitering | 0.65 | Adjusted by vessel type multiplier |
| Speed anomaly | 0.65 (0.45 if data error) | Data errors get reduced credibility |
| Heading anomaly | 0.65 | Adjusted by vessel type multiplier |
| AIS gap | 0.55 (0.65 if fast) | Fast vessels get severity boost |
| Dark vessel | 0.55 (0.65 if fast) | Fast vessels get severity boost |
| Zone lingering | 0.60 | Duration-proportional |
| Kinematic implausibility | 0.55 (0.40 if > 10nm jump) | Large jumps = data error, not spoofing |
| Statistical outlier | 0.65 | Contextual signal — less definitive alone |
| Collision risk | 0.65 | Reduced if COLREGS-compliant maneuvering |
| Route deviation | 0.60 | Requires learned baseline |
| Type mismatch | 0.55 | Behavioral inference — not conclusive |
