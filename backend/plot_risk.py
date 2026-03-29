import sqlite3
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os

# DB file
db_path = "/Users/thomasou/Github/HarborOS/backend/harboros.db"

# Connect to database
conn = sqlite3.connect(db_path)
alerts_df = pd.read_sql("SELECT * FROM alerts", conn)

# Basic settings
sns.set_theme(style="darkgrid", context="talk")
plt.figure(figsize=(12, 7))

# Define colors for actions
action_colors = {
    "monitor": "#2ecc71",   # Green
    "verify": "#f39c12",    # Orange
    "escalate": "#e74c3c",  # Red
    "ignore": "#95a5a6"     # Gray
}

# Ensure categories are ordered
category_order = ["monitor", "verify", "escalate"]
alerts_df['recommended_action'] = pd.Categorical(alerts_df['recommended_action'], categories=category_order, ordered=True)

# Plot distribution
ax = sns.histplot(
    data=alerts_df,
    x='risk_score',
    hue='recommended_action',
    multiple='stack',
    palette=action_colors,
    bins=40,
    edgecolor="black",
    linewidth=0.5
)

plt.title("HarborOS Risk Score Distribution & Recommended Actions", fontsize=18, fontweight='bold')
plt.xlabel("Aggregate Risk Score (0 - 100)", fontsize=14)
plt.ylabel("Number of Alerts", fontsize=14)

# Add median/mean lines
mean_score = alerts_df['risk_score'].mean()
median_score = alerts_df['risk_score'].median()
plt.axvline(mean_score, color='red', linestyle='--', linewidth=2, label=f'Overall Mean: {mean_score:.1f}')
plt.axvline(median_score, color='blue', linestyle=':', linewidth=2, label=f'Overall Median: {median_score:.1f}')
plt.legend()

# Save plot
artifact_dir = "/Users/thomasou/.gemini/antigravity/brain/4507ac7c-5718-405c-932d-59c7c1de295d/artifacts"
os.makedirs(artifact_dir, exist_ok=True)
plot_path = os.path.join(artifact_dir, "risk_distribution.png")

plt.tight_layout()
plt.savefig(plot_path, dpi=300)
plt.close()

# Calculate min/max for each action type to understand thresholds
print("Risk Score Ranges by Action:")
for action in category_order:
    subset = alerts_df[alerts_df['recommended_action'] == action]
    if not subset.empty:
        print(f"{action.upper():<10}: Min={subset['risk_score'].min():.1f}, Max={subset['risk_score'].max():.1f}, Count={len(subset)}")

from collections import Counter
import json

# Analyze what anomalies drive high risk scores
print("\nMost common anomalies for VERIFY/ESCALATE:")
high_risk = alerts_df[alerts_df['recommended_action'].isin(['verify', 'escalate'])]
anom_counter = Counter()
for signals_str in high_risk['anomaly_signals_json']:
    if signals_str:
        signals = json.loads(signals_str)
        for s in signals:
            anom_counter[s['anomaly_type']] += 1

for anom, count in anom_counter.most_common():
    print(f"{anom}: {count}")

conn.close()
