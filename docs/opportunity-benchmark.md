# Opportunity Benchmark

Phase 10B turns the StepHarbor Opportunity Map for agentic coding failures into a safe, reproducible benchmark suite.

Batch 10B.1 created the initial inert scenario matrix. Batch 10B.2 added safe synthetic fixtures for those scenarios. Batch 10B.3 added a non-executing local benchmark runner v1. Batch 10B.4 added local metric computation over runner output. Batch 10B.5 adds explicit local evidence report helpers and docs. These batches do not add dashboard, API endpoint, remote telemetry, or production-routing integration.

## Scenario Matrix

The matrix lives under `benchmarks/opportunity-map/scenarios/`. Each scenario is a JSON definition using `schemaVersion: "opportunity-benchmark-scenario.v1"`.

Scenarios describe safe category-level expectations:

- Opportunity Map problem family
- inert action category
- expected production decision when known
- expected advisory uncertainty-router decision
- expected uncertainty driver category IDs
- expected reduction step kinds when applicable
- explicit safety flags

Scenario files are definitions only. They do not execute commands, require network access, mutate repositories, access secrets, or create fixture repositories.

## Scenario Schema

Each scenario includes:

| Field                             | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `schemaVersion`                   | Stable scenario schema version.                             |
| `id`                              | Stable machine-friendly scenario ID.                        |
| `problemFamily`                   | One of the 10 Opportunity Map problem families.             |
| `action`                          | Category-only action metadata.                              |
| `expected.productionDecision`     | Optional known current production posture.                  |
| `expected.advisoryRouterDecision` | Required advisory uncertainty-router expectation.           |
| `expected.uncertaintyDrivers`     | Expected stable privacy-safe driver IDs.                    |
| `expected.reductionStepKinds`     | Expected metadata-only reduction steps for reducible cases. |
| `fixtureRefs`                     | Optional references to synthetic fixture contexts.          |
| `safety`                          | Required inert/non-executing safety contract.               |

## Problem Family Coverage

| Problem family                              | Scenario examples                                                           | Expected posture examples | Expected uncertainty drivers                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `destructive_edits_deletes_reverts`         | unobserved destructive file change, overwrite with unknown recovery         | DEFER                     | `target_file_not_observed`, `destructive_operation_recovery_unknown`, `recovery_checkpoint_missing` |
| `dangerous_commands_boundary_escapes`       | critical command category, workspace boundary violation                     | BLOCK                     | `command_risk_critical`, `destructive_command_detected`, `workspace_boundary_violation`             |
| `secrets_exfiltration`                      | secret path category, secret material category                              | BLOCK                     | `secret_path_detected`, `secret_pattern_detected`, `secret_material_detected`                       |
| `git_workflow_repo_integrity`               | force-push category, protected-branch landing category                      | BLOCK or ESCALATE         | `force_push_detected`, `protected_branch_risk`, `direct_mainline_risk`                              |
| `missing_stale_low_quality_context`         | blind edit, stale target observation                                        | DEFER                     | `target_file_not_observed`, `target_file_stale`, `target_file_hash_changed`                         |
| `skipped_absent_misleading_verification`    | missing validation before landing, failed validation                        | DEFER or ESCALATE         | `validation_missing`, `validation_failed`, `landing_action_detected`                                |
| `runaway_loops_token_burn_context_collapse` | repeated defer, no progress with retry exhaustion                           | DEFER or ESCALATE         | `repeated_defer_detected`, `retry_budget_exceeded`, `no_net_progress_detected`                      |
| `sensitive_surfaces_large_diffs`            | sensitive surface missing context, sensitive surface with context available | DEFER then ESCALATE       | `sensitive_path_detected`, `sensitive_context_missing`, `sensitive_change_review_required`          |
| `subagent_plugin_provenance`                | unknown delegated provenance, untrusted delegated provenance                | DEFER or ESCALATE         | `provenance_unknown`, `delegated_action_provenance_unknown`, `provenance_untrusted`                 |
| `environment_deploy_uncertainty`            | ambiguous deploy target, production environment category                    | DEFER or BLOCK            | `environment_unknown`, `deploy_target_ambiguous`, `production_environment_detected`                 |

## Production Decision vs Advisory Router Decision

`expected.productionDecision` represents current deterministic production behavior only when that posture is already known without a runner or fixture. It is optional because Batch 10B.1 does not execute scenarios.

`expected.advisoryRouterDecision` is required for every scenario. It describes how the Phase 10A advisory uncertainty router should classify the scenario once a later runner maps fixture signals into an `UncertaintyProfile`.

The benchmark matrix does not make the advisory router authoritative. Production decision routing remains unchanged.

## Benchmark Fixtures

Fixtures live under `benchmarks/opportunity-map/fixtures/`. Each fixture includes `benchmark-fixture.json` using `schemaVersion: "opportunity-benchmark-fixture.v1"`.

Fixtures are synthetic and inert. They support later benchmark runner work by providing tiny local contexts and category marker metadata. They do not execute scenario actions and do not contain real secrets, real deploy targets, real URLs, real private paths, or dangerous executable scripts.

Command, deploy, secret, provenance, recovery, and autonomy conditions are represented as category metadata, not as executable instructions. Package scripts in fixtures are inert echo-only placeholders.

| Fixture                            | Supported problem families                                                   | Purpose                                                                                 | Safety notes                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `fixture-minimal-repo`             | destructive edits/deletes/reverts; missing/stale context; skipped validation | Tiny source and test context for file observation, recovery, and validation categories. | Local source only, inert package scripts.                     |
| `fixture-node-validation-repo`     | dangerous commands/boundary escapes; skipped validation                      | Tiny validation context plus command-risk category markers.                             | No command category is executable.                            |
| `fixture-sensitive-surface-repo`   | secrets exfiltration; sensitive surfaces/large diffs                         | Toy sensitive-surface context plus secret-category markers.                             | Contains no real secret values or credential files.           |
| `fixture-git-workflow-repo`        | dangerous commands/boundary escapes; git workflow/repo integrity             | Metadata-only git workflow and workspace-boundary categories.                           | Does not contain git metadata and performs no git operations. |
| `fixture-deploy-repo`              | environment/deploy uncertainty                                               | Metadata-only deploy and environment category simulation.                               | No real endpoints, targets, or deploy scripts.                |
| `fixture-autonomy-provenance-repo` | runaway loops/token burn/context collapse; subagent/plugin provenance        | Metadata-only repeated-defer, progress, scope, and delegated-provenance categories.     | Does not track runtime activity.                              |

## Benchmark Runner v1

Batch 10B.3 adds a non-executing local runner module. The runner loads inert scenarios and safe synthetic fixtures, validates their safety metadata, converts category IDs into synthetic uncertainty profile input, builds an `UncertaintyProfile`, routes it through the advisory uncertainty router, and compares actual advisory output to scenario expectations.

The runner compares:

- expected advisory router decision
- expected uncertainty driver IDs
- expected reduction step kinds when present

The runner result uses `schemaVersion: "opportunity-benchmark-run.v1"` and returns in-memory raw counts and per-scenario checks. It does not write benchmark report artifacts by default and does not make accuracy or performance claims.

Runner v1 is intentionally limited:

- It does not execute scenario actions.
- It does not execute fixture package scripts.
- It does not require network access.
- It does not mutate repositories.
- It does not access real secrets.
- It does not use production decision routing for advisory scoring.
- It does not attach benchmark output to decisions, audit records, analytics, dashboard output, or API responses.

No `npm run benchmark:opportunity` script is added in 10B.3. The runner is exercised through tests and exported modules only.

## Benchmark Metrics v1

Batch 10B.4 adds local metric computation over the in-memory benchmark runner result. Metrics use `schemaVersion: "opportunity-benchmark-metrics.v1"`.

Metrics are computed from runner output only. They do not read files, execute scenarios, execute package scripts, require network access, mutate repositories, or write report artifacts.

Metrics include advisory decision match rate, expected-driver match rate, expected-reduction-step match rate, family coverage, posture counts, family pass/fail counts, and safety counters.

These metrics evaluate the synthetic advisory uncertainty benchmark only. They do not evaluate production routing, do not prove real-world performance, and should not be used for public benchmark claims until later evidence and reporting batches define presentation rules.

| Metric                        | Definition                                                                                           | Notes                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Advisory decision match rate  | Expected advisory router decisions matched divided by evaluated scenarios.                           | Uses advisory uncertainty router output, not production routing. |
| Uncertainty-driver match rate | Expected driver IDs present in actual profile drivers divided by total expected driver IDs.          | Extra actual drivers are allowed.                                |
| Reduction-step match rate     | Expected reduction step kinds present in actual reduction plan divided by total expected step kinds. | Extra actual steps are allowed.                                  |
| Family coverage               | Problem families represented in the evaluated run.                                                   | Follows the stable Opportunity Map family order.                 |
| Unsafe execution count        | Count derived from runner safety flags indicating command execution.                                 | Expected to remain zero.                                         |
| Privacy leak count            | Reserved safety counter for privacy leak detection in benchmark output.                              | Current metric computation keeps this zero.                      |

## Benchmark Report and Evidence Table

Batch 10B.5 adds explicit report helpers:

- `createOpportunityBenchmarkReport(runResult, metrics, options)`
- `formatOpportunityBenchmarkSummaryMarkdown(report)`
- `writeOpportunityBenchmarkReport(report, outputDir)`

The report uses `schemaVersion: "opportunity-benchmark-report.v1"`. It includes benchmark schema versions, a local raw metric summary, an evidence table grouped by problem family, safety booleans, and stable limitation IDs.

Report artifacts are not written by default. The writer creates `report.json` and `summary.md` only when explicitly called with an output directory. Tests write artifacts to temporary directories. No `npm run benchmark:opportunity` script is added in 10B.5.

If a later wrapper writes to the repository, the intended local artifact directory is:

- `artifacts/opportunity-benchmark/report.json`
- `artifacts/opportunity-benchmark/summary.md`

Generated evidence must keep the same safety model:

- no scenario action execution
- no fixture package script execution
- no network access
- no fixture or scenario mutation
- no real secret access
- no production decision routing authority

The current results documentation is in [Opportunity Benchmark Results](opportunity-benchmark-results.md).

## Privacy and Safety Rules

Scenario and fixture files use category IDs instead of private values. They must not contain raw source code, diffs, commands intended for execution, prompts, repo names, branch names, file paths, URLs, hostnames, package names, environment values, secrets, validation logs, or private project names.

Every scenario declares:

```json
{
  "inert": true,
  "executesCommands": false,
  "touchesRealSecrets": false,
  "requiresNetwork": false,
  "mutatesRepository": false
}
```

Fixture metadata declares:

```json
{
  "synthetic": true,
  "inert": true,
  "containsRealSecrets": false,
  "containsExecutableDangerousCommands": false,
  "requiresNetwork": false,
  "mutatesRepository": false
}
```

Schema tests enforce these safety flags and reject raw-looking private values in scenario and fixture content.

## Current Status

Batch 10B.5 status:

- Initial scenario matrix created.
- Safe synthetic fixtures created.
- Non-executing local runner v1 created.
- Local in-memory metric computation created.
- Explicit local evidence report helpers created.
- Results documentation created.
- All 10 Opportunity Map problem families are represented.
- At least two scenarios exist per family.
- Every scenario references a synthetic fixture context.
- Runner output is in-memory only by default.
- Metrics output is in-memory only by default.
- Report artifacts are opt-in only.
- No unsafe execution, network access, real secret access, or repository mutation is performed by the benchmark matrix or fixtures.

Later batches can add command wrappers or presentation layers against these stable scenario IDs, fixture IDs, expected drivers, reduction step kinds, metric fields, and report schema while preserving the non-executing safety model.
