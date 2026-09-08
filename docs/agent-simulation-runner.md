# Agent Simulation Runner

Batch 12.5 defines Agent-in-the-Loop Runner v1 for Phase 12. In this batch, runner means an inert scripted runner over category-only Phase 12 assets. It is a schema/orchestration layer for synthetic example runs, not a real agent runner.

The runner is deterministic, local, and non-executing. It does not call Codex, does not run agents, does not execute commands, does not run tests, does not create repositories, does not collect real traces, does not evaluate baselines, and does not validate performance.

## Inputs

The runner consumes existing safe Phase 12 assets:

- persona and scenario matrix entries from Batch 12.1,
- controlled synthetic fixtures from Batch 12.3,
- Codex-like adapter inputs from Batch 12.4,
- normalized proposed actions produced by the adapter mapping helper.

The runner uses those assets to check that persona, scenario, fixture, and adapter references are compatible. It then emits a synthetic run record with scripted decision categories, uncertainty metadata, reduction step categories, a trace event skeleton, baseline-readiness fields, calibration-readiness fields, and safety/privacy flags.

## Run Types

Scripted synthetic runs are static examples. They show how a future controlled flow can be represented, but they are not evidence that an agent behaved in that way.

Future controlled simulations may use the same schema with a future harness, but that future harness is not implemented here.

Future reviewed simulation traces may add review labels through a later protocol. No review workflow is implemented here.

Real beta or user evidence is a later evidence tier. This runner does not produce that evidence.

## Trace Skeletons

Each run includes a `traceEventSkeleton` using the Batch 12.2 trace event vocabulary. Skeleton events contain only event kind, sequence index, actor, payload category, and non-execution flags.

Skeletons are compatible with future trace records, but they are not collected traces and do not contain raw payloads.

## Excluded Data

Runner inputs and outputs are category-only. They exclude raw Codex output, raw prompts, raw commands, raw diffs, raw source code, raw validation logs, real paths, secrets, environment values, deployment targets, private data, real repository names, and real package names.

This preserves privacy and keeps the artifact suitable for future review, future baseline planning, dataset, and calibration-readiness work without introducing private project content.

## Claim Boundaries

Runner decisions are scripted expected categories. They are not actual runtime StepHarbor decisions, not uncertainty-router outputs, and not validation results.

The runner does not make uncertainty routing authoritative. StepHarbor remains not conformal and does not provide statistical guarantees. The runner is product-first and reproducible, but it does not provide real-world validation, real agent validation, completed agent-in-the-loop validation, benchmark proof of real-world performance, formal verification, sandboxing, enterprise readiness, production safety guarantees, exfiltration-proof behavior, public disclosure approval, or legal/IP conclusions.

## Future Use

Later Phase 12 batches can use these run records for:

- trace review and labeling protocol design,
- baseline comparison planning,
- research dataset and artifact packaging,
- evaluation context,
- future calibration dataset construction.

Those future uses must continue to distinguish synthetic example runs from future controlled simulations and from later human or beta evidence.

Batch 12.6 defines the trace review and labeling protocol that can reference these synthetic run records. The protocol adds category-only review examples; it does not perform real review or create reviewed traces.

Batch 12.7 consumes synthetic run records and review labels in a synthetic baseline-comparison framework. Those comparisons are category-only planning artifacts and do not run baselines, agents, commands, traces, or StepHarbor runtime decisions.

Batch 12.8 packages synthetic run references into a synthetic research artifact package. The package includes run linkage examples only and does not include raw run payloads or real trace recordings.
