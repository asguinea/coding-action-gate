# Codex Action Adapter

## Purpose

Batch 12.4 defines a Codex-like action adapter schema and deterministic mapping layer for future Phase 12 simulations. The adapter converts category-only proposed action descriptions into normalized proposed actions that can later populate `proposed_action` trace events.

This is a schema/mapping layer, not real Codex integration. It does not call Codex, does not run agents, does not parse raw agent output, does not execute commands, does not create traces, does not run CodingActionGate decisions, and does not validate performance.

## Data Boundaries

The adapter separates four concepts:

- raw agent output: out of scope for this batch and not stored,
- category-only adapter input: safe metadata describing a proposed operation, intent, target, scope, and risk surface,
- normalized proposed action: deterministic CodingActionGate-compatible categories plus expected uncertainty and interception metadata,
- future CodingActionGate runtime action: a later runtime object outside this batch.

Adapter inputs exclude raw Codex output, raw prompts, raw commands, raw diffs, raw source code, raw logs, paths, secrets, environment values, deployment targets, and private data.

## Phase 12 Connections

Adapter inputs link to existing personas, scenarios, and controlled fixtures. Fixture and scenario metadata enrich the normalized output with expected interception points, uncertainty dimensions, driver IDs, reduction step kinds, and expected decision categories.

The normalized output is designed for future runner compatibility, future trace compatibility, future review and labeling, future baseline comparison, and future calibration-readiness dataset construction.

Batch 12.5 consumes normalized proposed actions from this adapter in an inert scripted runner. That consumption does not call Codex, does not parse raw agent output, and does not execute the proposed action.

Batch 12.8 references adapter input IDs and normalized action IDs in the synthetic research artifact package asset graph. Those references remain category-only and do not include raw Codex output.

## Mapping Diagnostics

`mappingDiagnostics` is category-only. It reports whether an input was mapped, partially mapped, or unknown, and can include safe warning IDs such as `missing_fixture_metadata`, `missing_scenario_metadata`, `scenario_fixture_family_mismatch`, `scenario_fixture_persona_mismatch`, `unsupported_operation_category`, and `unknown_target_category`.

Diagnostics do not include raw prompts, raw commands, raw paths, raw source code, private values, or real agent output.

## Claim Boundaries

Batch 12.4 defines schema, examples, and pure deterministic mapping only. It does not provide real Codex integration, real coding-agent execution, completed simulation evidence, real-environment validation, benchmark proof of real-environment performance, conformal risk control, statistical assurances, sandboxing, enterprise readiness, production safety guarantees, public disclosure approval, or legal/IP conclusions.

CodingActionGate remains non-conformal, and the uncertainty router remains advisory and non-authoritative.
