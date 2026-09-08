# Limitations and threat model

StepHarbor is a research and development prototype. Its rules inspect proposed actions and available evidence. It does not isolate processes, mediate all filesystem access, or prevent an agent from bypassing its integration.

## Execution boundary

`decide` and `exec` return authorization decisions. They do not apply edits or execute the proposed command. `read` reads a permitted path and records an observation. `validate` runs configured commands in a shell: use trusted policies and trusted workspaces. The dashboard is read-only.

Command detection uses heuristics rather than a complete shell interpreter. Aliases, nested interpreters, obfuscation, filesystem races, and changes between authorization and execution can invalidate assumptions. Secret detection covers known patterns and cannot guarantee that all sensitive content is recognized.

Runtime records and exported feedback are local data. Inspect them before sharing. Known synthetic token strings in tests exercise redaction; never replace them with live credentials. Optional local analytics can be disabled with `STEPHARBOR_ANALYTICS=0`.

## Evidence boundary

The scenario benchmark uses synthetic metadata and inert actions. It measures behavior on those fixtures. It does not establish that a real agent is prevented from making mistakes.

Offline trajectory experiments use retrospective labels and proxy losses. Keep trajectory groups disjoint across training, calibration, and test; preserve fixed seeds and grids; never tune a selector on held-out test outcomes. Selection results depend on the stated loss definitions and calibration assumptions. Distribution shift can invalidate statistical conclusions.

The runnable synthetic experiment checks controller behavior on generated distributions. Historical full-dataset outputs are not bundled, and a full dataset-to-result rerun has not been validated for this release candidate. Do not interpret the presence of historical experiment scripts as a claim of complete empirical reproducibility.
