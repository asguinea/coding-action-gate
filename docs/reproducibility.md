# Reproducibility

Empirical results originate from completed experimental runs. The release retains experiment code and selected aggregate outputs from those runs. End-to-end reproduction using a clean installation of this public release has not yet been revalidated. The checks described below cover the runtime, synthetic computation, and regeneration of figures from the provided aggregate inputs.

## Supported environment

Use Node.js 24 LTS and Python 3.13 on macOS or Linux, with Git available on PATH. The standard workflow requires no API keys, no agent calls, and no dataset downloads after `npm ci`. Allow a few minutes for installation and checks. The synthetic reproduction takes seconds on a contemporary laptop and writes small local outputs. Full empirical exploration can require tens of gigabytes; it is outside the verified quick reproduction.

```sh
npm ci
npm run check
npm run smoke:install
npm run reproduce
```

Set `PYTHON=/path/to/python3` if needed. `npm run reproduce` reruns the 20-scenario inert benchmark, the self-contained Python tests, and 2,400 synthetic controller evaluations: 8 distributions × 5 seeds × 5 risk budgets × 6 burden budgets × 2 confidence levels. It checks the three output hashes in `scripts/reproduction-reference.json` and fails on drift. The raw controller CSV matches the retained reference calculation byte for byte on the reference platform. Across platforms, `p_lcb` confidence bounds are formatted to 12 decimal places before checksum verification; every other CSV cell remains exact. The raw CSV is also retained. This accounts for observed platform differences of at most 1.7e-16 in that bound without masking decision or threshold changes.

Outputs go to `reproduction/`: `benchmark-metrics.json`, `controller-results.csv`, `controller-results.canonical.csv`, `controller-summary.json`, and `checksums.json`. The synthetic generator also writes ignored reports in the experiment workspace. Wall-clock timestamps are removed from the checked summary; no numerical fields are removed. Reference hashes must be reviewed before updating them after algorithm changes.

## Regenerate figures

Three plots use the compact, aggregate inputs in `research/risk_controlled_intervention/reference-data/`. The fourth uses a fresh run of the seeded synthetic generator. Input hashes are verified before plotting, and five generated numerical tables are checked against `scripts/figure-reference.json`. These commands regenerate descriptive figures from those inputs; they do not retrain models or re-extract trajectories.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r research/risk_controlled_intervention/requirements-figures.txt
.venv/bin/python scripts/reproduce-figures.py
```

The output directory is `research/risk_controlled_intervention/reports/report_assets/`. It contains PNG/PDF plots, source tables, JSON metadata, and a synthetic regime table. Rendering can vary with platform/fonts; compare numeric source tables rather than PDF byte hashes.

## Optional empirical workspace

The upstream data is [NJU-LINK/CodeTraceBench](https://huggingface.co/datasets/NJU-LINK/CodeTraceBench). `research/risk_controlled_intervention/data-source.json` records an immutable upstream revision, manifest byte sizes and SHA-256 hashes. Both pinned manifests were checked against the retained reference inputs and match. The downloader rejects a checksum mismatch or a conflicting local cache. Raw trajectory archives are excluded from Git.

```sh
.venv/bin/python -m pip install -r research/risk_controlled_intervention/requirements-empirical.txt
.venv/bin/python research/risk_controlled_intervention/scripts/download_manifests.py --split verified
.venv/bin/python research/risk_controlled_intervention/scripts/audit_codetracebench.py --split verified
.venv/bin/python research/risk_controlled_intervention/scripts/download_verified_artifacts.py --manifest-only
```

The final command plans artifact downloads without fetching them. Read `SCHEMA_LOCK.md` and the scripts before continuing with large downloads. Upstream licenses and task-repository notices continue to apply; see [third-party notices](../THIRD_PARTY_NOTICES.md).

The empirical directory retains parsers, split builders, losses, baseline training, and policy-selection utilities. The original experiments produced the retained results; a fresh raw-download → preprocessing → training → empirical-results run of this public release remains pending. Historical environment versions are recorded to support that rerun. The raw data and large intermediate prediction files are excluded from the source distribution.

## Experimental discipline

Keep the original trajectory-level split seeds, target definitions, and fixed grids when comparing results. Calibration chooses policies; held-out test data evaluates them. Do not tune on test outcomes or interpret retrospective proxy losses as causal prevention. Retain upstream and output hashes, environment details, and the revision of your code alongside new runs.

The clean suite retains algorithm, parser, safety, CLI, and runtime tests. Historical checks that only asserted the presence or prose of development reports are outside this release. No missing-data skips are used to claim that those historical reports have been reproduced.
