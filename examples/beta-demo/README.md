# CodingActionGate Beta Demo

This demo generates real local CodingActionGate runtime data under `.coding-action-gate/` so the beta UI can be launched in Live Local mode.

It creates a safe demo workdir with:

- `README.md`
- `src/service.ts`
- `src/service.test.ts`
- `auth/service.ts`
- a fake `.env` value used only for secret-read blocking

The generated runtime data includes:

- a `PROCEED` README edit after the target file was read
- a `DEFER` service edit with read-before-write and related-test context
- an `ESCALATE` auth edit after the sensitive file was read
- `BLOCK` examples for `.env`, `rm -rf .`, and production deploy
- file observations
- a deferred action registry record
- validation result records
- Git workflow and landing-risk audit evidence

## Run The Demo

Build CodingActionGate and the UI first:

```sh
npm run build
npm run ui:build
```

Generate demo data:

```sh
npm run demo:beta
```

Launch the beta UI:

```sh
node dist/cli/cli.js ui --cwd examples/beta-demo/workdir
```

The command prints the API URL and UI URL. Open the printed UI URL to inspect the Live Local dashboard.

## Expected Decisions

The demo should show all four decision postures:

- `PROCEED`: safe README edit after reading `README.md`
- `DEFER`: service edit before required file/test context is complete
- `ESCALATE`: auth edit after the sensitive file has been inspected
- `BLOCK`: secret read, destructive command dry-run, and production deploy dry-run

## Safety Notes

- Dangerous examples are passed only through `coding-action-gate exec`, which remains dry-run.
- The demo does not execute `rm -rf .`, deploy commands, commits, pushes, or agent actions through CodingActionGate.
- The only real command execution is scoped setup inside `examples/beta-demo/workdir` and the explicit safe validation command `node -e "process.exit(0)"`.
- Fake secret-like values are test values only and should be redacted by CodingActionGate output/audit handling.

## Custom Output Directory

You can generate into a custom directory:

```sh
node examples/beta-demo/scripts/generate-demo-data.mjs --out /tmp/coding-action-gate-beta-demo
```

For safety, the script only cleans output directories under `examples/beta-demo/` or the system temp directory.
