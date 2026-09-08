# Offline intervention experiments

This workspace contains Python implementations for parsing coding-agent trajectories, defining prefix and trajectory losses, evaluating offline selectors, and generating seeded synthetic controller experiments.

Start with the root [reproducibility guide](../../docs/reproducibility.md). The default reproduction command needs only Python's standard library. Optional historical empirical scripts require additional dependencies and upstream data.

- `scripts/`: algorithms, parsers, and experiment utilities.
- `tests/`: self-contained algorithm and parser tests.
- `SCHEMA_LOCK.md`: parsing, label alignment, and derived feature contracts.
- `reports/model_score_schema.json`: score metadata schema used by diagnostics.

Empirical results originate from completed experimental runs; selected aggregate outputs are retained in `reference-data/`. Generated reports, raw data, and model outputs stay untracked. Historical report inventories and development narrative checks are not part of the self-contained suite. End-to-end reproduction using a clean installation of this public release has not yet been revalidated.
