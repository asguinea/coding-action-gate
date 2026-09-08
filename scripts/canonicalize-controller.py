"""Normalize only the confidence-bound representation for cross-platform checks."""
import csv
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reproduction" / "controller-results.csv"
DESTINATION = ROOT / "reproduction" / "controller-results.canonical.csv"

with SOURCE.open(newline="", encoding="utf-8") as source:
    reader = csv.DictReader(source)
    if not reader.fieldnames or "p_lcb" not in reader.fieldnames:
        raise SystemExit("Missing p_lcb field in controller output")
    with DESTINATION.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=reader.fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in reader:
            bound = float(row["p_lcb"])
            if not math.isfinite(bound) or not 0 <= bound <= 1:
                raise SystemExit("Invalid confidence bound")
            # libm can differ in its final bits across operating systems.
            # All other cells, including decisions and thresholds, stay exact.
            row["p_lcb"] = format(bound, ".12f")
            writer.writerow(row)
