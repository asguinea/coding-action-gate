# StepHarbor First Run

StepHarbor is a runtime authorization layer for agentic coding. It evaluates proposed actions before execution and returns one of four decisions:

- `PROCEED`: the action may execute immediately.
- `DEFER`: the action is not authorized yet because evidence or context is missing, stale, or incomplete.
- `ESCALATE`: the action may be valid, but needs human approval or review.
- `BLOCK`: the action violates a hard safety or policy boundary and must not execute.

DEFER does not mean failure. DEFER means the agent may continue autonomously, but must first gather missing evidence, refresh stale context, inspect related files, run checks, or clarify state before the original action can be authorized.

## Verify Install

For local preview tarball installs:

```sh
stepharbor --version
stepharbor doctor
```

Installed `stepharbor` should work from any repository. From a source checkout, use:

```sh
npm run build
node dist/cli/cli.js --version
node dist/cli/cli.js doctor
```

Local preview tarballs include bundled dashboard assets from `ui/dist`. Source checkouts may require:

```sh
npm run ui:build
```

## Initialize Policy

Create a starter policy in a repository:

```sh
stepharbor init --template node
stepharbor doctor
```

This writes `stepharbor.policy.yml`. It does not edit existing project files other than the requested policy output.

Inspect and validate the effective policy:

```sh
stepharbor policy show
stepharbor policy validate
stepharbor policy explain
```

See [policy.md](policy.md) for policy visibility and practical behavior notes.

For local preview evaluation on actual repositories, follow [real-repo-trial.md](limitations.md) and record results with [beta-feedback-template.md](../CONTRIBUTING.md).

## Try A Safe Dry-Run

`stepharbor exec` remains dry-run only. It authorizes a command but does not execute it:

```sh
stepharbor exec "echo hello"
```

For action JSON files, use:

```sh
stepharbor decide <actionFile> --json --no-audit
```

## Gather Context And Retry

If an edit is deferred because of missing or stale context, read the relevant files and retry the deferred action:

```sh
stepharbor read src/foo.ts
stepharbor read test/foo.test.ts
stepharbor retry <deferredActionId>
```

The retry may then `PROCEED`, `ESCALATE`, or `BLOCK` depending on the evidence.

## Launch The Dashboard

```sh
stepharbor ui
```

The dashboard is localhost-only and read-only. It can show local audit records, deferred actions, observations, validation state, Git state, and policy visibility where available. It cannot approve actions, retry actions, edit files, run commands, mutate policy, or send telemetry.

If source-checkout UI assets are missing, run:

```sh
npm run ui:build
```

## Export Feedback

Export a sanitized local feedback bundle when requested:

```sh
stepharbor export-feedback --out stepharbor-feedback.json
```

The export is local-only and redacts supported secret-like values and sensitive fields.

## Uninstall

```sh
npm uninstall -g stepharbor
```

## Reset Local State

StepHarbor stores local runtime state under `.stepharbor/` in the repository where commands run. Remove it only when intentionally deleting local StepHarbor state:

```sh
rm -rf .stepharbor
```

This deletes local audit records, deferred-action records, file observations, and validation evidence. It does not remove `stepharbor.policy.yml`.

## Security And Privacy

- StepHarbor is local-first.
- Local analytics is stored under `.stepharbor/analytics/`.
- No remote telemetry exists in this phase.
- Analytics records product-behavior events, not source code, file contents, diffs, raw commands, raw paths, environment variables, secrets, repo names, or validation logs.
- Inspect local analytics with `stepharbor analytics summary`.
- Clear local analytics events only with `stepharbor analytics clear --yes`; this does not clear audit logs, deferred actions, observations, validation state, or policy.
- Disable local analytics with `STEPHARBOR_ANALYTICS=0`.
- Analytics does not replace audit logs.
- `stepharbor exec` is dry-run only.
- The dashboard API is localhost-only and read-only.
- The dashboard has no mutation endpoints.
- Secret-like values and sensitive data are redacted in CLI and audit output where supported.

## More Help

```sh
stepharbor help
stepharbor help decisions
stepharbor help defer
stepharbor help policy
stepharbor help security
stepharbor help ui
stepharbor help install
stepharbor help analytics
```
