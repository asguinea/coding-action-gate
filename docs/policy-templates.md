# CodingActionGate Policy Templates

`coding-action-gate init` writes a starter `coding-action-gate.policy.yml` for a project.

```sh
coding-action-gate init --template node
```

The command is non-destructive by default. It fails when the output policy already exists unless `--force` is provided.

## Templates

### basic

Use for an individual project where you want CodingActionGate safety rules without required validation gates.

- Validation before commit: disabled
- Validation before push: disabled
- Protected branches: `main`, `master`, `production`, `release/*`
- Sensitive paths include `.env`, `.ssh/**`, `.aws/**`, `secrets/**`, `auth/**`, `security/**`, and `.github/workflows/**`

### node

Use for Node or TypeScript projects.

- Commit validation: `npm test`, `npm run lint`, `npm run typecheck`
- Push validation: `npm test`, `npm run build`
- Adds Node-oriented sensitive paths such as `src/auth/**`, `src/security/**`, `src/billing/**`, `src/payments/**`, `prisma/**`, and `migrations/**`

### strict

Use for conservative team settings.

- Validation is required before commit and push
- Thresholds are tighter than `basic`
- Sensitive paths include auth, billing, payments, security, infrastructure, cloud config, kube config, and production infra paths

### monorepo-lite

Use for simple repositories with `apps/*` and `packages/*`.

- Commit validation: `npm test`, `npm run lint`
- Push validation: `npm test`, `npm run build`
- Sensitive paths include `apps/*/auth/**`, `apps/*/billing/**`, `apps/*/payments/**`, `packages/*/auth/**`, `packages/*/security/**`, and `infra/**`

## Boundaries

Templates reuse CodingActionGate default policy rules. They do not change enforcement behavior in code, add policy editing UI, inspect package manifests, fetch remote templates, or create `.coding-action-gate/` runtime data.
