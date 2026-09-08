# Uncertainty-Control Public Evidence

This folder is for the broader uncertainty-aware control-plane thesis. StepHarbor is one instantiation of the broader uncertainty-aware control-plane thesis; this folder does not modify StepHarbor runtime behavior.

Reliable AI requires an uncertainty-aware control plane. The control plane converts uncertainty signals into explicit operational decisions: PROCEED, DEFER, ESCALATE, or BLOCK.

U1.1 and U1.2 catalogue public evidence sources only; they do not prove the thesis, implement a simulator, or validate a production system. No simulator is implemented in this batch, and no empirical result is claimed.

Many AI mistakes occur in situations where uncertainty should be explicitly managed, but this evidence map does not claim uncertainty explains every AI mistake.

## Contents

- `docs/selection-criteria.md`: U1.1 thesis, inclusion criteria, exclusions, controlled vocabulary, and claim boundaries.
- `docs/public-evidence-map-v0.md`: U1.2 human-readable evidence map with the required 15-row table.
- `data/public-evidence-map.v0.json`: U1.2 machine-readable dataset catalogue.
- `schema/publicEvidenceMapSchema.ts`: controlled vocabulary and TypeScript data shape.
- `publicEvidenceMap.ts`: pure loader, validator, deterministic summarizer, and simulator shortlist helper.
- `index.ts`: local exports for tests and future research-only consumers.

## Boundary

This package is a public-evidence inventory. It does not add model calls, dataset downloads, dataset preprocessing, calibration, conformal prediction, conformal risk control, production routing, advisory routing authority, CLI commands, API endpoints, UI surfaces, telemetry behavior, or StepHarbor authorization behavior.
