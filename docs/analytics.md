# StepHarbor Local Analytics

StepHarbor local analytics exists to help local preview evaluators understand product behavior in their own workspace. It is local-only and inspectable.

## Storage

Analytics events are stored as append-only JSONL in:

```sh
.stepharbor/analytics/events.jsonl
```

Analytics is separate from audit logs. It does not replace audit history, deferred-action records, observations, validation state, or policy.

## What Is Collected

Analytics records product-behavior categories such as:

- decision outcomes: `PROCEED`, `DEFER`, `ESCALATE`, `BLOCK`
- action categories such as `run_command`, `edit_file`, `git`, or `run_tests`
- DEFER reason categories and fetch-plan step kinds
- retry outcomes
- uncertainty categories such as levels, top-driver IDs, reduction step kinds, and advisory router recommendations
- command usage events such as `doctor_run`, `init_run`, `export_feedback_run`, and `ui_launched`

Uncertainty analytics events added in Batch 10A.9 are local-only and category-level:

| Event type                                  | Safe fields                                                                                                                                                 | Explicitly excluded                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `uncertainty_profile_created`               | schema version, overall level, score bucket, impact, reducibility, dimensions present, limited top drivers, dimension levels, plan availability, step count | raw profile, source, diffs, commands, prompts, paths, repo names, branch names, secrets, validation logs |
| `uncertainty_reduction_plan_created`        | schema version, reduction step kinds, step count, expected next decision, limited top drivers                                                               | raw reduction plan, raw commands, package scripts, paths, URLs, hostnames, secrets                       |
| `uncertainty_router_recommendation_created` | schema version, advisory recommendation, deterministic confidence label, safe rationale IDs, driver counts, plan availability, limited top drivers          | raw router result, raw prompts, commands, paths, branch names, repo names, validation logs               |

## What Is Not Collected

Analytics must not store:

- source code or file contents
- diffs or patches
- raw commands
- raw prompts or user requests
- raw paths or absolute paths
- package names or script names
- environment variables
- secrets, tokens, API keys, or passwords
- repository names
- branch names
- validation logs
- URLs, hostnames, usernames, machine identifiers, or persistent user identifiers

No remote telemetry is sent in this phase.

## Inspect A Summary

```sh
stepharbor analytics summary
```

The summary reports local aggregate counts only, such as total events, event types, decision distribution, DEFER resolution, command usage, action category distribution, and uncertainty aggregates when uncertainty events exist.

For sanitized machine-readable output:

```sh
stepharbor analytics summary --json
```

Malformed JSONL lines are skipped and counted without printing their contents.

## Clear Analytics

Preview the clear behavior:

```sh
stepharbor analytics clear
```

Clear local analytics events only:

```sh
stepharbor analytics clear --yes
```

This deletes only `.stepharbor/analytics/events.jsonl`. It does not delete audit logs, deferred actions, observations, validation state, policy, or all of `.stepharbor/`.

## Disable Recording

Disable future analytics recording for a command or shell:

```sh
STEPHARBOR_ANALYTICS=0
```

`false` and `off` are also treated as disabled values. Disabling affects recording only; `stepharbor analytics summary` and `stepharbor analytics clear --yes` can still read or clear existing local analytics state.

Persistent local enable/disable commands are not implemented yet.

During real repository trials, inspect `stepharbor analytics summary` before exporting feedback. Follow [real-repo-trial.md](limitations.md) and avoid sharing raw commands, paths, source code, diffs, environment variables, secrets, repo names, or validation logs.
