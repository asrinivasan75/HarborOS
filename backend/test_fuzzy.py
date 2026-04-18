from app.services.fuzzy_risk import fuzzy_risk_score, RULES, _evaluate_rule, defuzzify_centroid, ANOMALY_SETS, METADATA_SETS, INSPECTION_SETS

print("Current Multiplication Logic:")
for an in [0.0, 0.5, 1.0]:
    for md in [0.0, 0.5, 1.0]:
        for ir in [0.0, 0.5, 1.0]:
            score, action, debug = fuzzy_risk_score(an, md, ir)
            if score == 80.0:
                print(f"an={an}, md={md}, ir={ir} -> score={score}")

print("\nFuzzy Logic Test:")
def compute_fuzzy(an, md, ir):
    activations = { "safe":0, "low":0, "medium":0, "high":0, "critical":0 }
    for rule in RULES:
        strength = _evaluate_rule(an, md, ir, rule)
        result_set = rule[3]
        activations[result_set] = max(activations[result_set], strength)
    return defuzzify_centroid(activations)

for an in [0.0, 0.5, 1.0]:
    for md in [0.0, 0.5, 1.0]:
        for ir in [0.0, 0.5, 1.0]:
            score = compute_fuzzy(an, md, ir)
            if round(score) == 80:
                print(f"[Fuzzy] an={an}, md={md}, ir={ir} -> score={score}")

