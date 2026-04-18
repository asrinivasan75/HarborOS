# Maritime Risk Scoring: What the Research Says

A plain-English summary of the academic research behind vessel anomaly detection and risk assessment, as it applies to HarborOS.

---

## 1. How Ships Are Supposed to Report Their Position (AIS Standards)

Every large commercial vessel is required by international law (IMO SOLAS Chapter V) to carry an Automatic Identification System (AIS) transponder that continuously broadcasts the ship's identity, position, speed, and heading.

**How often ships must report (Class A transponders):**

| Ship Status | Reporting Interval |
|---|---|
| At anchor, moving < 3 knots | Every 3 minutes |
| Underway, 0-14 knots | Every 10 seconds |
| Underway, 0-14 knots, changing course | Every 3.3 seconds |
| Underway, 14-23 knots | Every 6 seconds |
| Underway, 14-23 knots, changing course | Every 2 seconds |
| Underway, > 23 knots | Every 2 seconds |

**What this means for detection:** If a vessel doing 15 knots hasn't reported in 30 seconds, something is already unusual. Our current 10-minute threshold is extremely conservative compared to what the IMO standard expects. The proper approach is speed-dependent gap detection, not a single fixed threshold.

**Source:** IMO Resolution A.1106(29), ITU-R M.1371 standard, [USCG AIS Requirements](https://www.navcen.uscg.gov/ais-requirements), [Comar Systems AIS Intervals](https://comarsystems.com/support-hub/what-are-ais-reporting-intervals/)

---

## 2. When Ships "Go Dark" (Dark Vessel Detection)

"Going dark" means a vessel intentionally disables its AIS transponder to avoid being tracked. This is one of the most significant indicators of suspicious maritime activity.

### Scale of the Problem

- Researchers analyzed **28 billion AIS signals** from 2017-2019 and found **55,000+ instances** of deliberate AIS disabling.
- Disabled transponders hide approximately **6% of all global fishing vessel activity**.
- This translates to roughly **1.6 million hours per year** of untracked vessel movement worldwide.
- Illegal fishing alone costs the global economy **$10-25 billion annually**.

### Why Vessels Go Dark

| Reason | Description |
|---|---|
| **Illegal fishing** | The most common reason. Vessels disable AIS near Exclusive Economic Zones to fish in protected or foreign waters without detection. |
| **Sanctions evasion** | Ships turn off AIS when heading to sanctioned ports (Iran, Venezuela, North Korea) to avoid creating a trail. Russia's shadow fleet showed 2x more AIS gaps in 2025 vs. 2022. |
| **Transshipment** | At-sea transfer of cargo between vessels. Fishing boats disable AIS near "loitering reefer" ships (refrigerated cargo vessels) to hide illegal catch transfers. |
| **Smuggling** | Drug trafficking, arms smuggling, and human trafficking operations disable AIS to avoid maritime patrols. |
| **Competitive hiding** | Some vessels hide from competitors in productive fishing grounds (legal but creates detection noise). |
| **Piracy avoidance** | Vessels in high-risk waters (Gulf of Aden, Strait of Malacca) sometimes disable AIS to avoid attracting pirates. |

### Geographic Hotspots

The three regions with the heaviest AIS disabling activity are:
1. **Waters adjacent to Argentina** (illegal fishing by foreign fleets)
2. **West African coast** (IUU fishing and transshipment)
3. **Northwest Pacific** (contested fishing grounds)

**Source:** [The Conversation - When fishing boats go dark](https://theconversation.com/when-fishing-boats-go-dark-at-sea-theyre-often-committing-crimes-we-mapped-where-it-happens-196694), [NOAA - Dark Fishing Vessels](https://www.fisheries.noaa.gov/feature-story/learning-more-about-dark-fishing-vessels-activities-sea), [Cambridge Core - Illegality of Going Dark](https://www.cambridge.org/core/journals/international-and-comparative-law-quarterly/article/illegality-of-fishing-vessels-going-dark-and-methods-of-deterrence/8E5D5C30A15C91BF17423ED1EF6EE0E2)

---

## 3. How Ships Collide and How to Predict It (Collision Risk)

Approximately **60% of maritime collisions are caused by human error**, specifically poor situational awareness (24%) and inadequate lookout (23%). The research community has developed mathematical formulas to predict collision risk before it happens.

### The Core Metrics: DCPA and TCPA

- **DCPA** (Distance to Closest Point of Approach): How close two ships will get to each other if neither changes course. Measured in nautical miles.
- **TCPA** (Time to Closest Point of Approach): How many minutes until they reach that closest point.

These two numbers are the foundation of every collision risk algorithm in the literature.

### The Research-Backed Formula (Mou et al. 2010, improved 2021)

The most widely-cited collision risk equation is:

```
CR = c * exp(-DCPA / a) * exp(-TCPA / b) * F_angle
```

Where:
- **CR** = Collision Risk, ranging from 0 (safe) to 1 (imminent collision)
- **a, b** = scaling factors based on a reference point (e.g., CR = 0.3 at 10nm distance and 20 minutes)
- **F_angle** = encounter type multiplier that changes how dangerous the situation is based on how the ships are approaching each other

**The encounter type matters enormously:**

| Encounter | Angle | F_angle | Why |
|---|---|---|---|
| Head-on | 0-60 degrees | 1.0 | Both ships must turn right (COLREGS Rule 14) |
| Crossing | 60-150 degrees | Up to 8.5 | Most dangerous — one ship must give way, confusion is common |
| Overtaking | 150-180 degrees | 2.34 | Overtaking vessel must keep clear (Rule 13) |
| Diverging | TCPA < 0 | 1.0 | Ships moving apart — not a threat |

A key improvement in the 2021 paper: the original formula had abrupt jumps in risk when a vessel crossed from "head-on" to "crossing" angles. The improved version uses smooth mathematical transitions in the 45-60 degree and 150-165 degree zones, eliminating false risk spikes.

### Ship Domain (Safety Bubble)

Every vessel has an invisible "ship domain" — the safety zone around it that other vessels shouldn't enter. The research defines this as an elliptical shape with four regions:

- **Front (L_A)**: Longest — determined by how far ahead the ship needs to detect and avoid threats. For a 231m container ship at 15 knots: **1,899 meters**.
- **Port/Left (L_B)**: Shorter — if you're the stand-on vessel, the other ship should avoid you. **310 meters**.
- **Starboard/Right (L_C)**: Medium — you may need to turn right to avoid. **1,379 meters**.
- **Aft/Behind (L_D)**: Shortest — equal to the average ship length. **231 meters**.

When CR = 1.0, a vessel has entered another's ship domain and collision avoidance is required.

**Source:** [Quantitative Collision Risk Calculation (Oxford Academic)](https://academic.oup.com/jcde/article/8/3/894/6275214)

---

## 4. How to Tell a Fishing Boat from a Cargo Ship by Behavior (Type Classification)

A vessel's AIS transmission declares what type of ship it is (cargo, tanker, fishing, etc.). But vessels sometimes lie. Research shows you can determine what a ship actually is by watching how it moves.

### The Study

Researchers analyzed **62 million AIS messages** from Chinese satellites (HY-1C and HY-2B) covering global waters, classifying five vessel types: cargo, tanker, fishing, passenger, and tug.

### What Makes Each Type Distinctive

| Feature | Cargo | Tanker | Fishing | Passenger | Tug |
|---|---|---|---|---|---|
| Avg longitude span | 200 degrees | 147 degrees | 49 degrees | 75 degrees | 22 degrees |
| Low-speed mean (< 5 kt) | 1.3 kt | 1.4 kt | 2.0 kt | 1.1 kt | 1.5 kt |
| High-speed mean (> 5 kt) | 12.3 kt | 12.4 kt | 8.0 kt | 12.0 kt | 8.6 kt |
| Voyage distance | Long, straight | Long, straight | Short, circular | Medium, regular | Short, local |

**Key insight:** Using only ship dimensions (length, width), classification accuracy was **73.1%**. Adding behavioral features (speed patterns, voyage distance, movement range) boosted accuracy to **92.7%**.

### Real-World Anomaly Detection

The classifier caught vessels lying about their type:
- **MMSI 367588710**: Registered as "cargo" but model predicted "fishing." Confirmed on MarineTraffic: it was a fishing vessel with visible fishing rods, broadcasting a false type code.
- **MMSI 701006130**: Registered as "passenger" but showed "staggered and complicated" trajectories. Confirmed: actually a fishing vessel.

**Why this matters for risk scoring:** A vessel claiming to be a cargo ship but behaving like a fishing boat (loitering, erratic heading, short range) should be flagged. The mismatch between declared identity and observed behavior is itself a strong risk signal.

**Source:** [Ship Classification and Anomaly Detection Based on AIS (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611351/)

---

## 5. How to Detect Loitering (The Most Common Anomaly)

According to the Indonesian Coast Guard, **nearly 60% of all detected maritime anomalies are loitering behavior**. It is the single most common suspicious activity at sea, yet historically the least studied.

### What Counts as Loitering

Loitering is defined as "movement with frequent course changes, at a certain speed, within a confined spatial range." It is NOT the same as anchoring — an anchored ship sits still; a loitering ship moves around in circles or erratic patterns within a small area.

### The Detection Formula

The researchers developed two parameters that capture loitering mathematically:

**Parameter F(c)** — Course-change intensity:
```
F(c) = (sum of all course changes * sum of all speeds) / (180 degrees * bounding box area)
```

This measures: how much is the vessel turning, how fast is it going, and how small is the area it's confined to? Higher values = more suspicious.

**Parameter F(c,h,d)** — Enhanced with heading discrepancy:
```
F(c,h,d) = (sum of course changes * sum of heading discrepancies * sum of speeds)
            / (bounding box area * straight-line distance traveled)
```

This adds: is the ship's bow pointing a different direction than it's actually moving? And how inefficient is the path compared to just going straight? This catches vessels actively maneuvering to stay in one area.

### Key Thresholds

- **Speed threshold**: 3 knots separates "possibly anchored" from "actively loitering"
- **Anchored vessel exclusion**: Bounding box < 700,000 square yards (~0.19 nm squared)
- **Maximum AIS gap**: 30 minutes between consecutive messages (longer gaps = discard that segment)
- **Time windows**: 12, 24, or 36 hours (check multiple scales)

### Scoring with Isolation Forest

Rather than hard thresholds, the research uses an unsupervised machine learning algorithm called Isolation Forest that scores each vessel on a 0-to-1 scale:

| Score | Interpretation |
|---|---|
| Near 1.0 | Definite loitering |
| Around 0.5 | Ambiguous — needs human review |
| Below 0.5 | Normal transit behavior |

### Results

The combined approach achieved:
- **97% accuracy** overall
- **92% F-score** (balance of precision and recall)
- Only **3 false alarms** out of 137 test trajectories
- Only **1 missed detection** out of 25 actual loitering cases

**Why this matters:** The research proves that loitering detection works best when you combine multiple spatial and temporal features rather than using simple "speed < 1 knot for X minutes" rules. And critically, the method is **region-independent** — it works anywhere in the world without retraining.

**Source:** [Loitering Behavior Detection by Spatiotemporal Characteristics (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10557514/)

---

## 6. Detecting Behavioral Outliers with Deep Learning

A separate line of research uses neural networks to learn what "normal" looks like for a given vessel, then flags anything that deviates significantly.

### The Approach

Researchers trained an encoder-decoder neural network on **100 days of AIS data** (472,000+ vessel-day samples) from U.S. coastal waters. The model learns to reconstruct expected vessel trajectories from four inputs: latitude, longitude, speed, and course.

When the model can't accurately reconstruct what a vessel actually did, the reconstruction error (RMSE) is high — indicating the vessel did something unusual.

### The 6-Sigma Rule

The threshold for "anomalous" is set at **six standard deviations above the mean reconstruction error**. This is deliberately conservative:

- At 3-sigma, you'd catch more anomalies but also more false positives
- At 6-sigma, you only flag the truly extreme outliers
- Vessels flagged as outliers **5+ times in 100 days** received elevated monitoring

### What It Catches

The system identified vessels that:
- Transmitted positions from completely different geographic locations within the same day (possible AIS spoofing)
- Made physically impossible speed or course transitions
- Exhibited movement patterns fundamentally inconsistent with any normal vessel behavior

### Performance

The best model (Bidirectional GRU neural network) achieved the lowest reconstruction error variance, meaning it was the most consistent at distinguishing normal from abnormal behavior. Training required ~17 hours on the full dataset.

**Source:** [Outlier Detection in Maritime Environments Using Deep Learning (arxiv)](https://arxiv.org/html/2406.09966v1)

---

## 7. Port Security Standards (ISPS Code)

The International Ship and Port Facility Security Code (ISPS) — adopted after 9/11 and enforced since July 2004 under SOLAS Chapter XI-2 — is the international standard for maritime security levels. Any system designed for defense or port security customers should align with these levels.

### The Three MARSEC Levels

| Level | Name | Meaning | Operator Actions |
|---|---|---|---|
| **MARSEC 1** | Normal | Day-to-day operations | Routine monitoring, standard access controls |
| **MARSEC 2** | Heightened | Credible threat identified | Enhanced screening, restricted access, additional patrols |
| **MARSEC 3** | Exceptional | Imminent or active incident | Emergency protocols, area lockdown, full asset deployment |

### How This Maps to Automated Risk Scores

| HarborOS Action | MARSEC Equivalent | Trigger |
|---|---|---|
| IGNORE | Below MARSEC 1 | Normal traffic, no anomalies |
| MONITOR | MARSEC 1 (elevated awareness) | Minor anomalies, low-confidence signals |
| VERIFY | MARSEC 2 | Multiple anomalies, moderate risk score, dispatch verification |
| ESCALATE | MARSEC 3 | High-confidence threat, imminent danger, immediate response needed |

**Source:** [IMO SOLAS XI-2 / ISPS Code](https://www.imo.org/en/ourwork/security/pages/solas-xi-2%20isps%20code.aspx), [USCG ISPS/MTSA](https://www.dco.uscg.mil/ISPS-MTSA/)

---

## 8. How Research Says Risk Should Be Combined (Fuzzy Logic vs. Hard Thresholds)

The most common criticism of simple weighted-sum risk scoring (like adding up anomaly points) is that it doesn't handle uncertainty well. The research community predominantly uses **fuzzy logic** — a mathematical framework designed specifically for situations where inputs are imprecise and categories overlap.

### Why Fuzzy Logic

Real maritime situations don't have clean boundaries. Is a vessel at 0.09 nm from another "safe" and at 0.11 nm "dangerous"? A hard threshold says yes. Fuzzy logic says the risk increases gradually across a range, which matches how real operators think.

### How It Works (Simplified)

1. **Fuzzify inputs**: Convert crisp numbers into fuzzy sets. For example, DCPA of 0.3 nm might be "60% medium risk, 40% low risk" simultaneously.

2. **Apply rules**: IF DCPA is small AND TCPA is short THEN risk is HIGH. The system has dozens of these rules covering all combinations.

3. **Aggregate**: Combine all rule outputs into a single fuzzy result.

4. **Defuzzify**: Convert the fuzzy result back to a crisp number (the final risk score).

### The ANFIS Approach

The most advanced systems use Adaptive Neuro-Fuzzy Inference Systems (ANFIS), which combine fuzzy logic with neural networks. The fuzzy rules are not hand-written — they are **learned from data**. The inputs used in the most cited ANFIS collision risk model are:

- DCPA (distance to closest approach)
- TCPA (time to closest approach)
- VCD (variance of compass bearing — how much the relative bearing is changing)
- Relative distance between vessels

### Collision Risk Membership Functions

The standard fuzzy sets for collision risk, used across multiple papers:

| Fuzzy Set | Risk Range | Meaning |
|---|---|---|
| Safe | 0 - 0.25 | No action needed |
| Low | 0 - 0.50 | Monitor passively |
| Medium | 0.25 - 0.75 | Active tracking, prepare contingencies |
| High | 0.50 - 1.00 | Immediate avoidance required |
| Critical | 0.75 - 1.00 | Emergency — collision imminent |

Note the overlapping ranges — this is intentional. A risk of 0.4 is simultaneously "a bit low risk" and "a bit medium risk." This overlap is what makes fuzzy logic handle uncertainty better than hard cutoffs.

**Source:** [Collision Risk Assessment Using Fuzzy Logic (ResearchGate)](https://www.researchgate.net/figure/Reasoning-rules-of-DCPA-TCPA-and-basic-collision-risk_tbl1_343344585), [ANFIS Collision Risk Inference (ASTESJ)](https://www.astesj.com/v04/i04/p19/)

---

## Summary: What the Research Tells Us

| Topic | Key Takeaway | Primary Source |
|---|---|---|
| AIS reporting | Ships report every 2-10 seconds, not every 10 minutes | IMO SOLAS / ITU-R M.1371 |
| Dark vessels | 6% of global fishing activity is hidden; 55,000+ disabling events in 3 years | NOAA / Global Fishing Watch |
| Collision risk | Use exponential decay formula with encounter-type multipliers, not simple distance thresholds | Mou et al. 2010, Oxford Academic 2021 |
| Ship classification | Behavioral features boost type identification from 73% to 93% accuracy | PMC 2022 |
| Loitering detection | Multi-parameter Isolation Forest scoring achieves 97% accuracy | PMC 2023 |
| Behavioral outliers | 6-sigma reconstruction error threshold with encoder-decoder neural networks | arxiv 2024 |
| Security levels | ISPS Code MARSEC 1/2/3 is the international standard | IMO SOLAS XI-2 |
| Risk combination | Fuzzy logic handles uncertainty better than hard thresholds | Multiple ANFIS/fuzzy papers |

---

*Last updated: March 2026. All sources are peer-reviewed academic papers, international maritime standards (IMO/SOLAS), or government agencies (NOAA, USCG).*
