# CodingActionGate First Run

CodingActionGate is a runtime authorization layer for agentic coding. It evaluates proposed actions before execution and returns one of four decisions:

- `PROCEED`: the action may execute immediately.
- `DEFER`: the action is not authorized yet because evidence or context is missing, stale, or incomplete.
- `ESCALATE`: the action may be valid, but needs human approval or review.
- `BLOCK`: the action violates a hard safety or policy boundary and must not execute.

DEFER does not mean failure. DEFER means the agent may continue autonomously, but must first gather missing evidence, refresh stale context, inspect related files, run checks, or clarify state before the original action can be authorized.

## Verify Install

For local preview tarball installs:

```sh
coding-action-gate --version
coding-action-gate doctor
```

Installed `coding-action-gate` should work from any repository. From a source checkout, use:

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
coding-action-gate init --template node
coding-action-gate doctor
```

This writes `coding-action-gate.policy.yml`. It does not edit existing project files other than the requested policy output.

Inspect and validate the effective policy:

```sh
coding-action-gate policy show
coding-action-gate policy validate
coding-action-gate policy explain
```

See [policy.md](policy.md) for policy visibility and practical behavior notes.

For local preview evaluation on actual repositories, follow [real-repo-trial.md](limitations.md) and record results with [beta-feedback-template.md](../CONTRIBUTING.md).

## Try A Safe Dry-Run

`coding-action-gate exec` remains dry-run only. It authorizes a command but does not execute it:

```sh
coding-action-gate exec "echo hello"
```

For action JSON files, use:

```sh
coding-action-gate decide <actionFile> --json --no-audit
```

## Gather Context And Retry

If an edit is deferred because of missing or stale context, read the relevant files and retry the deferred action:

```sh
coding-action-gate read src/foo.ts
coding-action-gate read test/foo.test.ts
coding-action-gate retry <deferredActionId>
```

The retry may then `PROCEED`, `ESCALATE`, or `BLOCK` depending on the evidence.

## Launch The Dashboard

```sh
coding-action-gate ui
```

The dashboard is localhost-only and read-only. It can show local audit records, deferred actions, observations, validation state, Git state, and policy visibility where available. It cannot approve actions, retry actions, edit files, run commands, mutate policy, or send telemetry.

If source-checkout UI assets are missing, run:

```sh
npm run ui:build
```

## Export Feedback

Export a sanitized local feedback bundle when requested:

```sh
coding-action-gate export-feedback --out coding-action-gate-feedback.json
```

The export is local-only and redacts supported secret-like values and sensitive fields.

## Uninstall

```sh
npm uninstall -g coding-action-gate
```

## Reset Local State

CodingActionGate stores local runtime state under `.coding-action-gate/` in the repository where commands run. Remove it only when intentionally deleting local CodingActionGate state:

```sh
rm -rf .coding-action-gate
```

This deletes local audit records, deferred-action records, file observations, and validation evidence. It does not remove `coding-action-gate.policy.yml`.

## Security And Privacy

- CodingActionGate is local-first.
- Local analytics is stored under `.coding-action-gate/analytics/`.
- No remote telemetry exists in this phase.
- Analytics records product-behavior events, not source code, file contents, diffs, raw commands, raw paths, environment variables, secrets, repo names, or validation logs.
- Inspect local analytics with `coding-action-gate analytics summary`.
- Clear local analytics events only with `coding-action-gate analytics clear --yes`; this does not clear audit logs, deferred actions, observations, validation state, or policy.
- Disable local analytics with `CODING_ACTION_GATE_ANALYTICS=0`.
- Analytics does not replace audit logs.
- `coding-action-gate exec` is dry-run only.
- The dashboard API is localhost-only and read-only.
- The dashboard has no mutation endpoints.
- Secret-like values and sensitive data are redacted in CLI and audit output where supported.

## More Help

```sh
coding-action-gate help
coding-action-gate help decisions
coding-action-gate help defer
coding-action-gate help policy
coding-action-gate help security
coding-action-gate help ui
coding-action-gate help install
coding-action-gate help analytics
```
