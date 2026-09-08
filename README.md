# StepHarbor

**Inspect an agent's next action before it runs.**

StepHarbor is a local authorization toolkit for coding agents. It combines explicit policies, workspace checks, file observations, validation evidence, and an audit trail to decide how a proposed action should proceed.

| Decision   | Meaning                                                 |
| ---------- | ------------------------------------------------------- |
| `PROCEED`  | The action satisfies the current checks.                |
| `DEFER`    | Gather missing evidence or refresh context, then retry. |
| `ESCALATE` | Request human review.                                   |
| `BLOCK`    | Reject the action under the current policy.             |

The TypeScript runtime includes a CLI and a read-only dashboard. A separate Python workspace explores offline intervention policies and risk/burden tradeoffs.

## Try it locally

Requires Node.js 24 LTS, npm, and Git. Python 3.13 is needed only for the controller experiments. No API key or paid service is required for the quick start.

```sh
git clone https://github.com/asguinea/stepharbor.git
cd stepharbor
npm ci
npm run build
node dist/cli/cli.js --version
node dist/cli/cli.js decide examples/actions/safe-readme-edit.json --policy examples/policies/proceed-only.policy.yml --json --no-audit
```

The example returns `PROCEED`. Authorization does not apply the proposed edit.

```sh
# Generate stepharbor.policy.yml in a project you own.
node dist/cli/cli.js init --template node
node dist/cli/cli.js doctor

# Build and launch the dashboard using generated example records.
npm run ui:build
npm run demo:beta
node dist/cli/cli.js ui --cwd examples/beta-demo/workdir

# Export local diagnostic summaries for inspection.
node dist/cli/cli.js export-feedback --cwd . --out stepharbor-feedback.json
```

See [first run](docs/first-run.md), [policy configuration](docs/policy.md), and [architecture](docs/architecture.md).

## Verify and reproduce

Empirical results originate from completed experimental runs. This release includes the experiment code and selected reference outputs. End-to-end reproduction using a clean installation of this public release has not yet been revalidated; runtime checks, synthetic experiments, and regeneration of figures from the provided aggregate inputs have passed.

```sh
npm run check
npm run smoke:install
npm run reproduce
```

`check` runs TypeScript checks for the runtime and UI, lint, behavioral tests, builds, and release-content checks. `smoke:install` packs and installs the CLI into a temporary project and exercises it there. `reproduce` runs the inert scenario benchmark and seeded synthetic controller experiment, then checks their deterministic output hashes.

See [reproducibility](docs/reproducibility.md) for inputs, expected outputs, resource requirements, and the scope of the available experiments.

## What this prototype establishes

- Deterministic policy decisions over structured action proposals.
- Evidence checks for workspace boundaries, sensitive paths, stale observations, Git workflows, and validation status.
- Structured repair guidance and reauthorization for deferred actions.
- Local JSONL audit records and a read-only dashboard.
- Runnable synthetic scenarios and offline policy-selection algorithms.

This is experimental software. `exec` is a dry run; an integration must enforce the returned decision before executing an action. `validate` **does execute** the configured validation command. Command classification is heuristic and is not a shell sandbox. A `PROCEED` result is not proof that an action is safe.

The offline controller is separate from runtime authorization. Synthetic and retrospective results do not establish production safety, causal prevention, or robustness under distribution shift. See [limitations and threat model](docs/limitations.md).

## Repository map

| Location       | Contents                                                   |
| -------------- | ---------------------------------------------------------- |
| `src/`         | Runtime, CLI, policies, detectors, audit stores, local API |
| `ui/`          | Read-only TypeScript dashboard                             |
| `test/`        | Runtime, integration, and regression tests                 |
| `benchmarks/`  | Inert scenarios and benchmark runner                       |
| `simulations/` | Agent fixtures and offline routing prototypes              |
| `research/`    | Python algorithms, parsers, tests, and experiment scripts  |
| `scripts/`     | Reproduction, package smoke checks, release checks         |
| `docs/`        | Usage, architecture, reproducibility, and limitations      |

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Report vulnerabilities as described in [SECURITY.md](SECURITY.md). Dependency and dataset attribution is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Third-party dependencies and datasets retain their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
