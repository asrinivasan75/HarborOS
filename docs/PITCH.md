# HarborOS

## The Problem

Harbors and littoral zones are increasingly contested. Small, cheap threats — smuggling vessels, hostile reconnaissance, unauthorized intrusions — exploit gaps in maritime awareness. Legacy systems are expensive, siloed, and slow. Operators drown in raw AIS data with no triage, no scoring, and no clear path to action.

## The Insight

You don't need a billion-dollar sensor network to defend a harbor. You need persistent awareness, smart anomaly detection, and a fast verification loop. Cheap sensing + software triage + rapid response beats exquisite systems that are too expensive to deploy widely.

## What HarborOS Does

HarborOS is a maritime awareness and decision-support platform that:

1. **Detects** suspicious vessels using AIS behavior analysis, geofence monitoring, and multi-signal anomaly detection
2. **Assesses** each contact with a composite risk score built from explainable signals — not a black box
3. **Recommends** operator actions: Ignore, Monitor, Verify, or Escalate
4. **Dispatches** verification requests to future sensor assets (cameras, patrol boats, drones) through a clean integration layer

## Why It Matters

- Every alert is **explainable** — operators see exactly what triggered it and why
- Risk scoring is **composable** — new signals and data sources plug in without rewriting the engine
- Verification is a **first-class concept** — the software is built to dispatch real assets, not just display dashboards
- The system works **today with software alone** and scales to hardware integration tomorrow

## How It's Different

| | Legacy Systems | Generic Dashboards | HarborOS |
|---|---|---|---|
| Anomaly detection | Manual monitoring | Basic thresholds | Multi-signal heuristics |
| Risk scoring | None or binary | Single metric | Composite + explainable |
| Operator guidance | None | Alerts only | Recommended actions |
| Hardware integration | Bespoke per sensor | None | Clean API stubs |
| Time to deploy | Months | Weeks | Hours |

## Current State

Working software MVP with:
- Live map view of vessel traffic with geofence overlays
- Heuristic anomaly detection engine (6+ signal types)
- Composite risk scoring with human-readable explanations
- Operator alert workflow with action recommendations
- Mocked verification dispatch flow
- Curated demo scenario at LA Harbor

## The Vision

HarborOS becomes the operating system for harbor defense — the layer between raw sensors and human decisions. Start with AIS and software. Add cameras, patrol assets, and drone tasking through the same verification API. Scale from one harbor to a network. The software layer is the hard part, and it's built.
