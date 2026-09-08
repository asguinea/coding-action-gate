"""Rebuild descriptive figures from checked aggregate inputs and fresh synthetic data."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = ROOT / "research" / "risk_controlled_intervention"
REFERENCE = EXPERIMENT / "reference-data"

for item in json.loads((REFERENCE / "manifest.json").read_text()):
    path = REFERENCE / item["file"]
    if path.parent != REFERENCE:
        raise SystemExit("Invalid reference path")
    if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
        raise SystemExit(f"Reference input changed: {item['file']}")

for script in [
    "evaluate_T17_synthetic_theorem_demonstration.py",
    "generate_T17_synthetic_figure_data.py",
    "plot_row_budget_trajectory_burden.py",
    "plot_structural_feasibility.py",
    "plot_controller_outputs.py",
    "plot_synthetic_regimes.py",
]:
    subprocess.run([sys.executable, str(EXPERIMENT / "scripts" / script)], cwd=ROOT, check=True)

output = EXPERIMENT / "reports" / "report_assets"
expected = json.loads((ROOT / "scripts" / "figure-reference.json").read_text())
for name, digest in expected.items():
    if Path(name).name != name:
        raise SystemExit("Invalid figure reference path")
    if hashlib.sha256((output / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f"Figure source table differs from the verified reference: {name}")
print("Five numerical output tables match the verified reference.")
print("Figures and source tables: research/risk_controlled_intervention/reports/report_assets/")
