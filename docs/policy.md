# StepHarbor Policy

StepHarbor policy is read-only enforcement configuration. It tells StepHarbor how to interpret workspace boundaries, sensitive paths, command risk, validation gates, Git workflow risk, and landing/deploy/publish behavior before an action is authorized.

## Default And Project Policy

If no project policy is found, StepHarbor uses the bundled default policy. In a repository, project policy is usually stored as:

```sh
stepharbor.policy.yml
```

Decision commands and policy visibility commands use the same policy loading path, so `stepharbor decide`, `stepharbor exec`, `stepharbor policy show`, `stepharbor policy validate`, and `stepharbor policy explain` should agree on the effective policy.

## Templates

Starter templates are available through `stepharbor init`:

- `basic`
- `node`
- `strict`
- `monorepo-lite`

Example:

```sh
stepharbor init --template node
```

## Inspect Policy

Show the effective policy source and sanitized section summary:

```sh
stepharbor policy show
```

Validate the effective policy:

```sh
stepharbor policy validate
```

Explain practical behavior:

```sh
stepharbor policy explain
```

All policy commands are read-only. They do not edit policy, approve actions, override decisions, mutate configuration, or send telemetry.

Policy commands send no remote telemetry.

## How Policy Relates To Decisions

- `PROCEED`: no matching policy or signal requires deferral, escalation, or blocking.
- `DEFER`: the action is not authorized yet because evidence or context is missing, stale, or incomplete.
- `ESCALATE`: the action may be valid, but needs human approval or review.
- `BLOCK`: the action violates a hard safety or policy boundary and must not execute.

DEFER does not mean failure. DEFER means the agent may continue autonomously, but must first gather missing evidence, refresh stale context, inspect related files, run checks, or clarify state before the original action can be authorized.

## Common Policy Effects

- Edit without a fresh read can `DEFER`.
- Destructive commands can `BLOCK`.
- Sensitive path edits can `ESCALATE`.
- Production deploy, publish, release, or other landing actions can `ESCALATE` or `BLOCK` depending on risk.
- Missing or stale required validation can `DEFER`.
- Failed required validation can `BLOCK`.

## What Policy Commands Do Not Do

Policy commands do not:

- edit or generate policy files
- approve actions
- bypass `BLOCK`, `DEFER`, or `ESCALATE`
- add approval or override workflows
- send remote telemetry
- control local analytics recording

Local analytics is controlled with `STEPHARBOR_ANALYTICS=0|false|off`, not policy.

For real repository evaluation, run `stepharbor policy validate` and `stepharbor policy explain` before the trial scenarios in [real-repo-trial.md](limitations.md).
