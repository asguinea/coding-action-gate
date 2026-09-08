# Contributing

Start with a focused issue describing the behavior to improve and a minimal example. Keep bug fixes separate from changes to experimental methodology.

Use Node.js 24 LTS and `npm ci`. Before proposing a change, run:

```sh
npm run check
npm run format:check
npm run smoke:install
npm run reproduce
```

Add regression tests for changed behavior. Tests must create their own temporary workspaces and must not depend on your home directory, credentials, or a particular Git branch. Use synthetic data in fixtures. Explain any change to seeds, splits, target definitions, policy grids, or reference outputs.

Never commit runtime stores, dataset downloads, raw trajectories, model outputs, personal paths, or credentials. Inspect `git diff --cached` and run the release checks before sharing changes. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
