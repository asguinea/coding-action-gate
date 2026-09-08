# Uncertainty Model Foundation

Batch 10A.1 introduced the foundation for CodingActionGate's uncertainty-aware authorization layer. Batch 10A.2 enriched the deterministic uncertainty profile mapping from existing signals. Batch 10A.3 added structured uncertainty reduction plans as metadata. Batch 10A.4 adds a non-authoritative uncertainty router module. Batches 10A.5 through 10A.8 deepen command, environment, sensitivity, recovery, and autonomy/budget uncertainty in the advisory layer. Batch 10A.9 adds local-only uncertainty analytics categories. Later batches can use this foundation when improving DEFER, ESCALATE, dashboard visibility, and benchmark evidence.

This is deterministic, explainable uncertainty management. It is not Bayesian uncertainty, probabilistic confidence, statistical calibration, formal verification, or a guarantee that an action is safe.

## Routing Status

This batch does not change decision routing.

Current behavior remains:

```text
signals -> decision
```

The Phase 10A direction is:

```text
signals -> uncertainty profile -> decision
```

Batch 10A.4 adds an advisory uncertainty router, but production routing still does not use the uncertainty profile, reduction plan, or router result. The profile, plan, and router result are metadata for future work and are not used by the decision engine.

## Schema

The stable schema version is:

```text
uncertainty-profile.v1
```

The profile contains:

- `overallScore`: deterministic score from `0` to `1`.
- `overallLevel`: `low`, `medium`, `high`, or `critical`.
- `impact`: separate impact level, also `low`, `medium`, `high`, or `critical`.
- `reducibility`: `reducible`, `partially_reducible`, or `irreducible`.
- `topDrivers`: highest-priority privacy-safe driver category IDs.
- `dimensions`: one profile for each supported uncertainty dimension.
- `recommendedDecision`: optional future advisory metadata; not used by production routing in Batch 10A.4.
- `uncertaintyReductionPlan`: optional structured metadata plan for reducing uncertainty; inspected by the advisory router but not used by production routing in this batch.

## Dimensions

Every profile includes these dimensions:

- `context`
- `freshness`
- `validation`
- `command`
- `sensitivity`
- `workspace_boundary`
- `git_workflow`
- `environment`
- `recovery`
- `autonomy_budget`
- `provenance`

Default dimension values are intentionally conservative and simple:

- `score: 0`
- `level: low`
- `impact: low`
- `reducibility: reducible`
- `drivers: []`
- `evidence: []`
- `missingEvidence: []`

The default reducibility is `reducible` because most uncertainty in CodingActionGate's current model represents missing evidence that a later fetch, read, validation run, or state check may reduce.

## Scores And Levels

Scores are deterministic category scores, not statistical probabilities:

- `0.00-0.24`: `low`
- `0.25-0.49`: `medium`
- `0.50-0.79`: `high`
- `0.80-1.00`: `critical`

The initial overall score uses the maximum dimension score. This is deliberately simple and explainable, and can be revised in later batches without implying probabilistic calibration.

## Drivers And Evidence

Drivers, evidence, and missing evidence use stable privacy-safe category IDs. These IDs are designed for later benchmark matching and safe serialization.

Examples:

- `target_file_not_observed`
- `target_file_freshness_unknown`
- `target_file_stale`
- `related_tests_not_observed`
- `validation_missing`
- `validation_failed`
- `command_risk_high`
- `command_risk_critical`
- `sensitive_path_detected`
- `secret_path_detected`
- `workspace_boundary_violation`
- `protected_branch_risk`
- `environment_unknown`
- `production_environment_detected`
- `recovery_state_unknown`
- `autonomy_budget_unknown`
- `provenance_unknown`

The profile must not include raw source code, raw diffs, raw commands, raw file paths, absolute paths, branch names, repo names, environment variables, secrets, secret-like values, or validation logs.

## Current Builder Scope

The Batch 10A.2 builder maps only existing CodingActionGate signals into the profile. It does not add new safety detectors or fragile inference.

Current mappings include:

- missing read-before-write evidence to `context` and `freshness`
- stale file state to `freshness`
- missing, stale, failed, or unknown validation to `validation`
- high and critical command risk to `command`
- sensitive and secret path signals to `sensitivity`
- workspace escape signals to `workspace_boundary`
- protected branch, force push, hook bypass, and branch risk signals to `git_workflow`
- staging, production, and unknown environment signals to `environment`
- destructive action with unknown recovery state to `recovery`
- supplied autonomy budget status or explicit safe autonomy metadata to `autonomy_budget`
- supplied delegation provenance to `provenance`

## Signal Mapping

| Existing signal family                             | Uncertainty dimension | Example drivers                                                                                                                             | Notes                                                                                                          |
| -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Read-before-write and related context signals      | `context`             | `target_file_not_observed`, `related_tests_not_observed`, `context_completeness_low`, `context_completeness_medium`                         | Uses existing target observation, related-test, and context completeness signals.                              |
| File freshness signals                             | `freshness`           | `target_file_freshness_unknown`, `target_file_stale`, `target_file_hash_changed`                                                            | Uses existing freshness state and hash-availability signals.                                                   |
| Validation gate signals                            | `validation`          | `validation_missing`, `validation_failed`, `validation_stale`, `validation_target_unclear`                                                  | Uses existing validation status, scope, and landing validation signals.                                        |
| Command risk signals                               | `command`             | `command_risk_high`, `command_risk_critical`, `command_classification_unknown`, `package_script_unknown`                                    | Uses existing command classification fields only.                                                              |
| Sensitive path and secret signals                  | `sensitivity`         | `sensitive_path_detected`, `sensitive_surface_detected`, `secret_path_detected`, `secret_pattern_detected`                                  | Uses existing path sensitivity and secret scan outputs.                                                        |
| Workspace boundary signals                         | `workspace_boundary`  | `workspace_boundary_violation`, `workspace_boundary_unknown`                                                                                | Uses existing workspace boundary detector outputs.                                                             |
| Git workflow signals                               | `git_workflow`        | `protected_branch_risk`, `direct_mainline_risk`, `force_push_detected`, `hook_bypass_detected`, `landing_action_detected`                   | Uses existing Git state, branch risk, and landing-action signals.                                              |
| Deploy, release, publish, and environment signals  | `environment`         | `production_environment_detected`, `deploy_target_ambiguous`, `release_surface_detected`, `publish_surface_detected`, `environment_unknown` | Uses existing landing and environment classification signals; does not inspect provider state.                 |
| Destructive operation and recovery-related signals | `recovery`            | `recovery_state_unknown`, `destructive_operation_recovery_unknown`                                                                          | Uses existing destructive-operation signals. Checkpoint detection is future-supported and not added here.      |
| Budget, retry, and runaway signals                 | `autonomy_budget`     | `autonomy_budget_unknown`, `autonomy_budget_exceeded`, `autonomy_budget_warning`, `retry_budget_exceeded`, `no_net_progress_detected`       | Uses existing `autonomyBudgetStatus` and explicit safe builder metadata only. No watchdog logic is added here. |
| Provenance and delegation signals                  | `provenance`          | `provenance_unknown`, `provenance_untrusted`, `delegated_action_provenance_unknown`                                                         | Uses existing delegation provenance signal only. No subagent/plugin tracking is added here.                    |

All mappings use stable category IDs rather than raw values. For example, a production deploy signal may produce `production_environment_detected`, but the profile must not contain raw commands, branch names, repo names, paths, diffs, logs, environment variables, or secrets.

## DEFER v2: Uncertainty Reduction Plans

DEFER v2 means reducible authorization uncertainty can be represented as an evidence-gathering plan. Batch 10A.3 introduces the structured plan model, but the plan is advisory metadata only in this batch.

Existing DEFER behavior remains unchanged. Legacy DEFER fields such as missing context, fetch plans, risk if proceeding, expected next decision, and reanalysis flags are not replaced or reinterpreted. Production routing still does not use the uncertainty profile or reduction plan.

Reduction plans use stable privacy-safe category IDs. They do not include raw source code, raw diffs, raw commands, raw file paths, full absolute paths, raw branch names, repo names, environment variables, secrets, validation logs, or provider-specific private values.

The reduction plan schema version is:

```text
uncertainty-reduction-plan.v1
```

Reduction steps include stable fields such as:

- `kind`
- `reduces`
- `driversAddressed`
- `requiredEvidence`
- `rationale`
- `priority`

The steps describe what evidence would reduce uncertainty; they do not execute reads, validation, checkpoint creation, Git operations, deploys, approvals, or any other action.

| Driver category                   | Reduction step kind                                                 | Reduces dimensions       | Expected evidence                                         |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| `target_file_not_observed`        | `read_target_file`                                                  | `context`, `freshness`   | `target_file_observed`, `target_file_hash_available`      |
| `target_file_stale`               | `refresh_target_file`                                               | `freshness`              | `target_file_observed`, `target_file_hash_available`      |
| `related_tests_not_observed`      | `read_related_tests`                                                | `context`, `validation`  | `related_tests_observed`                                  |
| `validation_missing`              | `run_validation`                                                    | `validation`             | `validation_result_available`                             |
| `validation_failed`               | `inspect_validation_failure`, `fix_validation_failure_before_retry` | `validation`             | `validation_result_failed`, `validation_result_available` |
| `command_classification_unknown`  | `classify_command`                                                  | `command`                | `command_classified`                                      |
| `package_script_unknown`          | `inspect_package_script`                                            | `command`                | `package_script_classified`                               |
| `sensitive_path_detected`         | `inspect_related_context`                                           | `context`, `sensitivity` | `related_context_observed`                                |
| `secret_path_detected`            | `stop_and_request_human_review`                                     | `sensitivity`            | none                                                      |
| `workspace_boundary_violation`    | `stop_and_request_human_review`                                     | `workspace_boundary`     | none                                                      |
| `protected_branch_risk`           | `inspect_branch_policy`                                             | `git_workflow`           | `git_state_available`                                     |
| `force_push_detected`             | `stop_and_request_human_review`                                     | `git_workflow`           | none                                                      |
| `environment_unknown`             | `inspect_environment`                                               | `environment`            | `environment_classified`                                  |
| `deploy_target_ambiguous`         | `confirm_deploy_target`                                             | `environment`            | `environment_classified`                                  |
| `production_environment_detected` | `stop_and_request_human_review`                                     | `environment`            | none                                                      |
| `recovery_state_unknown`          | `inspect_recovery_state`                                            | `recovery`               | `recovery_state_classified`                               |
| `retry_budget_exceeded`           | `stop_and_request_human_review`                                     | `autonomy_budget`        | none                                                      |
| `provenance_unknown`              | `inspect_provenance`                                                | `provenance`             | `provenance_classified`                                   |

Later batches may connect reduction plans to DEFER output and routing. Batch 10A.3 does not automatically resolve uncertainty, execute plan steps, or guarantee safe execution after following a plan.

## Uncertainty Router v1

Batch 10A.4 adds a pure deterministic router that maps an `UncertaintyProfile` to an advisory routing recommendation. The router is privacy-safe: it reads only stable profile fields such as scores, levels, dimensions, drivers, evidence categories, missing evidence categories, and reduction plan step kinds.

The router is non-authoritative in Batch 10A.4. Existing production decision routing remains unchanged, and the router result is not attached to decision output, audit output, CLI output, dashboard data, analytics, or API surfaces.

The router uses this precedence:

1. `BLOCK`
2. `ESCALATE`
3. `DEFER`
4. `PROCEED`

Hard forbidden or critical boundary drivers tend toward `BLOCK`. High-impact partially reducible or irreducible uncertainty tends toward `ESCALATE`. Reducible uncertainty with an ordinary evidence-gathering reduction plan tends toward `DEFER`. Low uncertainty with no missing evidence and no reduction plan tends toward `PROCEED`.

The router result schema version is:

```text
uncertainty-router-result.v1
```

The router's `confidence` field is a deterministic label about clarity of the recommendation. It is not probabilistic confidence, Bayesian confidence, statistical calibration, or a safety guarantee.

| Profile condition                            | Example drivers                                                               | Advisory recommendation | Notes                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| Low/default profile with no missing evidence | none                                                                          | `PROCEED`               | No reduction plan is needed.                                                  |
| Missing target observation with a read step  | `target_file_not_observed`                                                    | `DEFER`                 | Ordinary evidence gathering can reduce context and freshness uncertainty.     |
| Missing validation with a validation step    | `validation_missing`                                                          | `DEFER`                 | Advisory only; the router does not run validation.                            |
| Sensitive surface with high impact           | `sensitive_path_detected`, `sensitive_surface_detected`                       | `ESCALATE`              | Some context gathering may help, but autonomous proceed is not recommended.   |
| Protected branch or direct mainline risk     | `protected_branch_risk`, `direct_mainline_risk`                               | `ESCALATE`              | Human review is preferred over ordinary autonomous defer.                     |
| Critical command risk                        | `command_risk_critical`                                                       | `BLOCK`                 | Treated as a hard block recommendation.                                       |
| Secret path or secret material               | `secret_path_detected`, `secret_pattern_detected`, `secret_material_detected` | `BLOCK`                 | Secret-related drivers do not become safe through ordinary context gathering. |
| Workspace boundary violation                 | `workspace_boundary_violation`                                                | `BLOCK`                 | Workspace escape is a hard boundary recommendation.                           |
| Force push or hook bypass                    | `force_push_detected`, `hook_bypass_detected`                                 | `BLOCK`                 | Critical Git safety boundary.                                                 |
| Production environment detected              | `production_environment_detected`                                             | `BLOCK`                 | Production exposure is a hard block recommendation in the advisory router.    |
| Environment unknown                          | `environment_unknown`                                                         | `DEFER`                 | Classification can reduce uncertainty when no higher-risk driver dominates.   |
| Ambiguous deploy target with landing risk    | `deploy_target_ambiguous`, `landing_action_detected`                          | `ESCALATE`              | Deploy ambiguity paired with landing risk is high impact.                     |
| Retry budget exceeded                        | `retry_budget_exceeded`                                                       | `ESCALATE`              | Human review is recommended, not ordinary autonomous retry.                   |

## Command And Environment Uncertainty

Batch 10A.5 deepens command and environment uncertainty mapping. Command uncertainty uses existing command risk and classification signals. Environment uncertainty uses existing deploy, release, publish, landing, and environment classification signals.

Unknown command classifications and unknown package scripts are represented as reducible command uncertainty. Reduction plans may suggest `classify_command` or `inspect_package_script`, but they do not execute commands or package scripts.

Ambiguous deploy targets are represented as reducible or partially reducible environment uncertainty. Reduction plans may suggest `inspect_environment` or `confirm_deploy_target`, but they do not deploy, publish, validate, approve, or contact external services.

Explicit production deploy, publish/release surfaces, pipe-to-shell commands, and critical command drivers remain hard or high-severity boundaries in the advisory router. Production routing remains unchanged in this batch.

All command and environment drivers, evidence, missing evidence, and reduction plan steps are privacy-safe category IDs. They must not contain raw commands, package names, script names, URLs, hostnames, project names, account names, branch names, repo names, paths, diffs, environment variables, secrets, or validation logs.

| Signal / condition                 | Dimension                | Driver ID                                                         | Reduction step                                                                 | Advisory router tendency                     |
| ---------------------------------- | ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Unknown command classification     | `command`                | `command_classification_unknown`                                  | `classify_command`                                                             | `DEFER`                                      |
| Unknown package script             | `command`                | `package_script_unknown`, `package_script_classification_missing` | `inspect_package_script`                                                       | `DEFER`                                      |
| High-risk command                  | `command`                | `command_risk_high`                                               | `classify_command` or human review depending context                           | `ESCALATE`                                   |
| Critical command                   | `command`                | `command_risk_critical`                                           | `stop_and_request_human_review`                                                | `BLOCK`                                      |
| Pipe-to-shell command              | `command`                | `pipe_to_shell_detected`                                          | `stop_and_request_human_review`                                                | `BLOCK`                                      |
| Privileged command                 | `command`                | `privileged_command_detected`                                     | `stop_and_request_human_review`                                                | `ESCALATE`                                   |
| Destructive command                | `command`, `recovery`    | `destructive_command_detected`, `recovery_state_unknown`          | `stop_and_request_human_review`, `inspect_recovery_state`, `create_checkpoint` | `ESCALATE` or `BLOCK` when critical          |
| Deploy command with unknown target | `command`, `environment` | `deployment_command_detected`, `environment_unknown`              | `inspect_environment`, `confirm_deploy_target`                                 | `DEFER` when no higher-risk driver dominates |
| Ambiguous deploy target            | `environment`            | `deploy_target_ambiguous`                                         | `confirm_deploy_target`                                                        | `DEFER` or `ESCALATE` depending impact       |
| Explicit production deploy         | `environment`            | `production_environment_detected`, `environment_risk_critical`    | `stop_and_request_human_review`                                                | `BLOCK`                                      |
| Release command                    | `environment`            | `release_surface_detected`, `environment_risk_high`               | `stop_and_request_human_review`                                                | `BLOCK`                                      |
| Publish command                    | `environment`            | `publish_surface_detected`, `package_publish_detected`            | `stop_and_request_human_review`                                                | `BLOCK`                                      |
| Local classified environment       | `environment`            | none                                                              | none                                                                           | `PROCEED` if no other uncertainty dominates  |
| Staging classified environment     | `environment`            | none                                                              | none                                                                           | `PROCEED` if no other uncertainty dominates  |

## Sensitivity Uncertainty And Sequential DEFER To ESCALATE

Batch 10A.6 models sensitivity-aware sequential DEFER to ESCALATE behavior in the advisory uncertainty layer. Sensitive surfaces are high-impact, but they are not always hard-blocked. Secret surfaces are treated more strictly than ordinary sensitive surfaces.

The intended advisory sequence is:

1. `DEFER` to reduce uncertainty when a sensitive surface lacks context, related evidence, or validation evidence.
2. `ESCALATE` once uncertainty is reduced but the sensitive change still requires human review.

This is advisory only. Production routing remains unchanged in this batch, and the router result is not attached to decisions, audit records, CLI output, dashboard data, analytics, or API surfaces.

Reduction plans do not read or expose secrets. Secret-related drivers produce `stop_and_request_human_review` or no ordinary autonomous reduction path. All sensitivity drivers, evidence, missing evidence, and plan steps are privacy-safe category IDs.

| Condition                                 | Drivers                                                                            | Reduction step                                  | Advisory router tendency |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------ |
| Sensitive path with target not observed   | `sensitive_path_detected`, `sensitive_context_missing`, `target_file_not_observed` | `read_target_file`, `inspect_related_context`   | `DEFER`                  |
| Sensitive path with related tests missing | `sensitive_surface_context_incomplete`, `related_tests_not_observed`               | `read_related_tests`, `inspect_related_context` | `DEFER`                  |
| Sensitive path with validation missing    | `sensitive_validation_missing`, `validation_missing`                               | `run_validation`                                | `DEFER`                  |
| Sensitive path with context available     | `sensitive_path_detected`, `sensitive_change_review_required`                      | `stop_and_request_human_review`                 | `ESCALATE`               |
| Secret path detected                      | `secret_path_detected`                                                             | `stop_and_request_human_review`                 | `BLOCK`                  |
| Secret pattern detected                   | `secret_pattern_detected`                                                          | `stop_and_request_human_review`                 | `BLOCK`                  |
| Secret material detected                  | `secret_material_detected`                                                         | `stop_and_request_human_review`                 | `BLOCK`                  |
| Sensitive path with production deploy     | `sensitive_path_detected`, `production_environment_detected`                       | `stop_and_request_human_review`                 | `BLOCK`                  |
| Sensitive path with critical command risk | `sensitive_path_detected`, `command_risk_critical`                                 | `stop_and_request_human_review`                 | `BLOCK`                  |

## Recovery Uncertainty

Batch 10A.7 models recovery uncertainty in the advisory uncertainty layer. Recovery uncertainty represents whether CodingActionGate has enough evidence that a risky action can be reversed or recovered from responsibly. It is not a guarantee of rollback.

Destructive operations with unknown recovery state increase recovery uncertainty. Existing evidence such as Git state, worktree cleanliness, validation results, target-file hashes, or workspace boundary checks can lower recovery uncertainty, but it does not automatically make an action safe.

Reduction plans may include metadata-only steps such as `inspect_recovery_state`, `inspect_git_state`, or `create_checkpoint`. The uncertainty layer does not execute these steps, create checkpoint files, run Git writes, execute commands, or perform rollback.

Critical destructive commands and hard boundary violations still recommend `BLOCK` in the advisory router when an existing hard-block driver is present. Irreversible recovery risk without a hard-block driver recommends human review rather than ordinary proceed.

The advisory router remains non-authoritative. Production routing remains unchanged in this batch. Recovery drivers, evidence, missing evidence, and plan steps are privacy-safe category IDs.

| Condition                                          | Recovery drivers                                                                                  | Reduction step                                | Advisory router tendency                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Destructive operation with unknown recovery        | `destructive_operation_recovery_unknown`, `recovery_state_unknown`, `rollback_confidence_unknown` | `inspect_recovery_state`, `create_checkpoint` | `DEFER` when no higher-risk driver dominates                     |
| Destructive operation with recovery evidence       | `destructive_file_change_detected`, `rollback_confidence_medium`                                  | none from recovery alone                      | lower recovery uncertainty; other drivers may still `ESCALATE`   |
| Delete operation detected                          | `delete_operation_detected`                                                                       | `inspect_recovery_state`, `create_checkpoint` | `DEFER` or `ESCALATE` depending impact                           |
| Overwrite operation detected                       | `overwrite_operation_detected`                                                                    | `inspect_recovery_state`, `create_checkpoint` | `DEFER` or `ESCALATE` depending impact                           |
| Irreversible operation risk                        | `irreversible_operation_risk`                                                                     | `stop_and_request_human_review`               | `ESCALATE` unless a hard-block driver dominates                  |
| Destructive command with critical command risk     | `destructive_command_detected`, `command_risk_critical`                                           | `stop_and_request_human_review`               | `BLOCK`                                                          |
| Workspace boundary violation with recovery unknown | `workspace_recovery_boundary_unknown`, `workspace_boundary_violation`                             | `inspect_workspace_boundary` or human review  | `BLOCK` when boundary violation is present                       |
| Git tracking unknown                               | `git_tracking_unknown`                                                                            | `inspect_git_state`                           | `DEFER`                                                          |
| Git state available                                | `git_tracking_available`, `git_worktree_clean` or `git_worktree_dirty`                            | none from recovery alone                      | lowers recovery uncertainty, does not guarantee safety           |
| Recovery checkpoint missing                        | `recovery_checkpoint_missing`                                                                     | `create_checkpoint`                           | `DEFER` when no higher-risk driver dominates                     |
| Recovery checkpoint available                      | `recovery_checkpoint_available`                                                                   | none                                          | future-supported; current signals do not create real checkpoints |

## Autonomy And Budget Uncertainty

Batch 10A.8 models autonomy and budget uncertainty in the advisory uncertainty layer. Autonomy and budget uncertainty represents uncertainty around repeated attempts, retry limits, context budget, action scope, diff churn, and progress.

This is not a runtime watchdog. The uncertainty layer does not enforce budgets, interrupt processes, kill processes, limit retries, or track progress at runtime.

Unknown or warning-level autonomy uncertainty can recommend advisory `DEFER` with a narrowed evidence-gathering plan. Repeated no-progress, retry-budget exceeded, context-budget exceeded, or autonomy-budget exceeded conditions recommend advisory `ESCALATE` unless an existing hard safety driver recommends `BLOCK`.

Reduction plans may include metadata-only steps such as `narrow_action_scope`, `inspect_progress_state`, `refresh_context`, `limit_retry_scope`, or `stop_and_request_human_review`. These steps are stable category IDs and are not executed by the uncertainty layer.

The advisory router remains non-authoritative. Production routing remains unchanged. Autonomy and budget drivers, evidence, missing evidence, and plan steps are privacy-safe category IDs.

| Condition                            | Autonomy/budget drivers                                  | Reduction step                                                                   | Advisory router tendency                              |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| No autonomy signal                   | none                                                     | none                                                                             | default low; no autonomy plan                         |
| Autonomy budget unknown but relevant | `autonomy_budget_unknown`, `autonomy_budget_not_tracked` | `narrow_action_scope`                                                            | `DEFER`                                               |
| Autonomy budget warning              | `autonomy_budget_warning`                                | `narrow_action_scope`, `refresh_context`, `inspect_progress_state`               | `DEFER` when no higher-risk driver dominates          |
| Autonomy budget exceeded             | `autonomy_budget_exceeded`                               | `stop_and_request_human_review`                                                  | `ESCALATE`                                            |
| Retry count high                     | `retry_count_high`                                       | `narrow_action_scope`, `limit_retry_scope`                                       | `DEFER` when no no-progress signal dominates          |
| Retry budget warning                 | `retry_budget_warning`                                   | `narrow_action_scope`, `limit_retry_scope`, `inspect_progress_state`             | `DEFER`                                               |
| Retry budget exceeded                | `retry_budget_exceeded`                                  | `stop_and_request_human_review`                                                  | `ESCALATE`                                            |
| Repeated defer detected              | `repeated_defer_detected`                                | `narrow_action_scope`, `inspect_progress_state`                                  | `DEFER` unless paired with limit/no-progress evidence |
| Repeated defer limit reached         | `repeated_defer_limit_reached`                           | `narrow_action_scope`, `inspect_progress_state`, `stop_and_request_human_review` | `ESCALATE`                                            |
| No net progress detected             | `no_net_progress_detected`                               | `narrow_action_scope`, `inspect_progress_state`, `stop_and_request_human_review` | `ESCALATE`                                            |
| Context budget exceeded              | `context_budget_exceeded`                                | `narrow_action_scope`, `stop_and_request_human_review`                           | `ESCALATE`                                            |
| Broad action scope                   | `action_scope_too_broad`                                 | `narrow_action_scope`                                                            | `DEFER`                                               |

## Uncertainty Analytics

Batch 10A.9 adds local-only uncertainty analytics categories. These use the existing `.coding-action-gate/analytics/events.jsonl` store and respect the existing opt-out values: `CODING_ACTION_GATE_ANALYTICS=0`, `CODING_ACTION_GATE_ANALYTICS=false`, and `CODING_ACTION_GATE_ANALYTICS=off`.

Uncertainty analytics record only category-level metadata: schema versions, levels, score buckets, impact, reducibility, dimension names, limited top-driver IDs, reduction step kinds, counts, booleans, and advisory router recommendations. They do not record raw uncertainty profiles, raw reduction plans, or raw router results wholesale.

Uncertainty analytics must not record source code, diffs, raw commands, prompts, raw paths, repo names, branch names, package names, script names, environment variables, secrets, validation logs, URLs, hostnames, cloud account names, or private values. They do not affect production routing and do not send data anywhere.

These events are intended to help understand local uncertainty patterns such as common drivers, uncertainty levels, reduction step kinds, and advisory router recommendations. Batch 10A.9 provides helper functions and summary aggregation; it does not automatically wire uncertainty analytics into production decision routing.

| Event type                                  | Safe fields                                                                                                                                                 | Explicitly excluded                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `uncertainty_profile_created`               | schema version, overall level, score bucket, impact, reducibility, dimensions present, limited top drivers, dimension levels, plan availability, step count | raw profile, raw paths, commands, prompts, diffs, source, repo names, branch names, secrets, validation logs |
| `uncertainty_reduction_plan_created`        | schema version, reduction step kinds, step count, expected next decision, limited top drivers                                                               | raw plan steps with raw values, commands, package scripts, paths, URLs, secrets, validation logs             |
| `uncertainty_router_recommendation_created` | schema version, advisory recommendation, deterministic confidence label, safe rationale IDs, driver counts, plan availability, limited top drivers          | raw router result, raw driver source values, prompts, commands, paths, branch names, repo names, secrets     |

`coding-action-gate analytics summary` includes additive uncertainty aggregates when these events exist, including event counts, overall-level counts, top-driver counts, router recommendation counts, and reduction-step-kind counts.

## Phase 10A Readiness Status

Phase 10A introduces the deterministic, advisory uncertainty foundation. The uncertainty profile, signal mapping, reduction plan, advisory router, and local analytics helpers are implemented as independent modules. Production decision routing does not use them yet.

| Component                                | Implemented in 10A | Production-authoritative? | Notes                                                                                              |
| ---------------------------------------- | ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| UncertaintyProfile                       | yes                | no                        | Stable schema `uncertainty-profile.v1`; includes every supported dimension.                        |
| Signal mapping                           | yes                | no                        | Maps existing deterministic CodingActionGate signals to privacy-safe category IDs.                 |
| Reduction plan                           | yes                | no                        | Stable schema `uncertainty-reduction-plan.v1`; metadata-only steps, no execution.                  |
| Advisory router                          | yes                | no                        | Stable schema `uncertainty-router-result.v1`; recommends only.                                     |
| Command/environment uncertainty          | yes                | no                        | Deepens command and deploy/release/publish representation without executing commands.              |
| Sensitivity sequential DEFER to ESCALATE | yes                | no                        | Models sensitive missing context as advisory `DEFER`, then review-required as advisory `ESCALATE`. |
| Recovery uncertainty                     | yes                | no                        | Represents recoverability evidence without checkpoint creation, rollback, or Git writes.           |
| Autonomy/budget uncertainty              | yes                | no                        | Represents retry/no-progress/budget pressure without watchdogs or enforcement.                     |
| Local uncertainty analytics helpers      | yes                | no                        | Helper-based local events only; no automatic production recording and no remote telemetry.         |

Phase 10A is ready for Phase 10B benchmark work because schema versions are stable, driver and evidence IDs are stable category IDs, serialized outputs are privacy-safe by construction, and benchmark fixtures can compare expected drivers, reduction steps, and advisory router recommendations without unsafe execution.

What is intentionally not implemented in Phase 10A:

- production uncertainty-based decision routing
- decision or audit attachment
- dashboard or local API uncertainty surfaces
- benchmark scenarios, runner, metrics, or reports
- automatic uncertainty analytics recording
- probabilistic, Bayesian, statistical, or formal verification claims
- checkpoint, rollback, runtime watchdog, process-kill, retry-enforcement, deploy, publish, or command execution behavior

See [uncertainty-readiness.md](limitations.md) for a concise Phase 10A readiness summary.

## Future Work

Later phases can decide whether and how to expose or integrate the advisory router into debug output, DEFER output, routing, analytics, or dashboard visibility.

Phase 10B will benchmark uncertainty behavior against the Opportunity Map. Phase 10A does not implement benchmark scenarios, runners, metrics, or reports.
