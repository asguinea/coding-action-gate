# Phase 17 Generic Agent Action Protocol

## Purpose

Batch 17.1 defines the generic protocol for representing future coding-agent proposed actions before StepHarbor authorization in controlled, disposable, privacy-safe environments.

This protocol defines how future proposed actions should be represented; it does not integrate with a real agent, capture real traces, execute actions, or create calibration data.

## Why Proposed Actions Must Be Captured Before Execution

Future controlled Phase 17 sessions need a normalized proposal envelope so StepHarbor can evaluate an intended action before anything runs or mutates a workspace.

The protocol records category-only action type, intent, risk, target, evidence state, workspace boundary, sensitivity, validation state, git state, environment, proposed execution category, payload policy, and timestamp category.

## Relationship To StepHarbor Authorization

The future adapter contract is proposal-first and authorization-first:

- Proposed actions must be authorized before execution.
- StepHarbor decision categories remain `PROCEED`, `DEFER`, `ESCALATE`, and `BLOCK`.
- Proposed action capture does not imply execution.
- `BLOCK` stops execution.
- `DEFER` requires evidence gathering before retry.
- `ESCALATE` requires human review before execution.
- `PROCEED` only allows execution inside current deterministic policy.
- Future calibrated/advisory signals are not authoritative now.

Deterministic StepHarbor decisions remain authoritative.

In short, proposed action capture does not imply execution.

## Supported Action Categories

The category-only protocol supports future proposed actions for `read_file`, `write_file`, `edit_file`, `delete_file`, `run_command`, `install_dependency`, `run_tests`, `git_commit`, `git_push`, `git_reset`, `git_clean`, `deploy`, `publish_or_release`, and `unknown_or_unsupported_action`.

Every supported category requires pre-execution authorization, can be captured only as a proposal, and must not execute during capture.

## Required Normalized Fields

Future adapters must provide category-only normalized fields for action category, target category, intent category, risk category, evidence state category, workspace boundary category, sensitivity category, validation state category, git state category, environment category, proposed execution category, payload policy category, and timestamp category.

## Raw Payload And Privacy Defaults

The default payload policy forbids commands, diffs, source code, paths, repository names, prompts, model outputs, validation logs, and secrets as included values.

The default inclusion set is limited to category-only action metadata, normalized action type, normalized risk category, normalized evidence state, normalized safety signal categories, normalized decision category, and sanitized outcome category.

The default exclusion set covers source content, diffs, command text, secrets, environment variables, private paths, repository names, branch names, prompts, model outputs, validation logs, human names, human emails, and customer data.

Any future sanitized excerpt would require explicit approval in a later controlled trace workflow.

## Controlled Environment Requirements

Future controlled sessions require disposable workspaces, no real secrets, no customer data, no private repositories without explicit approval, no network unless explicitly approved, no dangerous command execution, no production deploy execution, no publish/release execution, privacy-sanitized logs, and trace review before dataset inclusion.

## Relationship To Phase 16 Gate Summary

This Batch 17.1 protocol links to the accepted Phase 16 gate summary record, `phase-16-gate-summary-001`.

The Phase 16 gate still does not pass. Production routing is not eligible now. Production routing is not enabled now. The raw gate summary payload is not embedded.

## What This Batch Does Not Do

This batch does not run a real agent, integrate with Codex, Claude Code, Gemini, or any other coding-agent system, capture real proposed actions, collect real traces, execute commands, mutate a repository, require network access, create calibration data, compute scores, compute thresholds, apply calibration, implement conformal prediction, implement conformal risk control, add runtime routing behavior, add policy/config flags, add CLI/API/dashboard surfaces, add telemetry behavior, or grant production authority.

Production/advisory/calibrated routing remains disabled and not eligible.

## Phase 17 Next Steps

Later Phase 17 work can use this protocol to design controlled agent integration prototypes, controlled dry-run sessions, privacy-safe proposed-action capture, trace review, baseline comparison, evidence summaries, and a future handoff to real-data calibration dataset construction.

This Batch 17.1 artifact itself creates no real evidence.

## Claim Boundaries

The safety object is inert, protocol-only, design-only, non-executing, non-mutating, local-only, non-networked, non-runtime-integrated, and records that no agent integration, real capture, trace creation, calibration data, scores, thresholds, calibration, advisory routing, calibrated routing, production routing, or conformal/CRC implementation is added.

The privacy object is category-only and records that prompts, actions, commands, diffs, source code, validation logs, traces, calibration data, score data, threshold data, routing data, config data, gate data, repository names, branch names, paths, users, emails, secrets, agent outputs, customer data, and reviewer identities are not included.

The claim-boundary object records protocol-only/design-only status and records that production routing, advisory routing, calibrated routing, production eligibility, real-agent integration, real-agent evidence, trace capture, reviewed traces, real calibration, real calibration datasets, real scores, nonconformity scores, thresholds, alpha, calibration, conformal risk control, guarantees, real evaluation results, and production authority are absent.

This protocol cannot support claims that real-agent integration exists, Codex/Claude/Gemini integration exists, real-agent evidence exists, real traces have been captured, real proposed actions have been collected, real calibration has started, a real calibration dataset exists, scores or thresholds exist, conformal routing is implemented, CRC is implemented, statistical guarantees exist, production routing is enabled, advisory/calibrated routing is authoritative, or the Phase 16 gate passes.
