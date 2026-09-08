import { cliExitCodes } from "../exitCodes.js";
import type { CliIO } from "../cli.js";

export const helpTopics = [
  "decisions",
  "defer",
  "policy",
  "security",
  "ui",
  "install",
  "analytics",
  "first-run"
] as const;

export type HelpTopic = (typeof helpTopics)[number];

const availableTopicsText = (): string => helpTopics.join(", ");

const mainHelp = `CodingActionGate is a runtime authorization layer for agentic coding. It decides whether
proposed actions should PROCEED, DEFER, ESCALATE, or BLOCK before execution.

Usage:
  coding-action-gate help [topic]

Guard actions:
  decide <actionFile>       Authorize an action JSON file without applying it.
  exec "<command>"          Authorize a shell command as a dry-run only.

Context and DEFER flow:
  read <path>               Read a file and record local observation evidence.
  retry <deferredActionId>  Reauthorize a deferred action after gathering evidence.

Git and validation:
  validate <kind>           Run an authorized validation command and record evidence.

Local dashboard:
  ui                        Launch the localhost-only read-only dashboard.

Setup and diagnostics:
  init                      Write a starter coding-action-gate.policy.yml file.
  doctor                    Run read-only project readiness checks.
  policy                    Show, validate, or explain the effective policy.

Feedback:
  export-feedback           Write a sanitized local diagnostic bundle.

Local analytics:
  analytics summary         Summarize local product-behavior analytics.
  analytics clear --yes     Clear local analytics events only.

Help:
  help decisions            Explain PROCEED, DEFER, ESCALATE, and BLOCK.
  help defer                Explain read-before-write, fetch plans, and retry.
  help policy               Explain policy visibility and starter templates.
  help security             Explain local-first safety and privacy boundaries.
  help ui                   Explain the read-only dashboard.
  help install              Explain local preview tarball install and reset.
  help analytics            Explain local analytics summary and clearing.
  help first-run            Show a simple first-run flow.

Run 'coding-action-gate --help' for command syntax, or 'coding-action-gate help decisions' to
understand the decision outcomes.
`;

const decisionsHelp = `CodingActionGate decision outcomes:

PROCEED
  The action may execute immediately if the calling agent or user chooses to run it.

DEFER
  The action is not authorized yet because evidence or context is missing, stale,
  or incomplete. DEFER does not mean failure. DEFER means the agent may continue
  autonomously, but must first gather missing evidence, refresh stale context,
  inspect related files, run checks, or clarify state before the original action
  can be authorized.

ESCALATE
  The action may be valid, but it requires human approval or review before it
  should execute.

BLOCK
  The action violates a hard safety or policy boundary and must not execute.

Use 'coding-action-gate help defer' for the DEFER and retry flow.
`;

const deferHelp = `DEFER flow:

CodingActionGate can DEFER actions when current evidence is missing or stale. Common
causes include read-before-write requirements, stale file state, missing related context,
or missing related tests.

Deferred decisions include a fetch plan where available. The agent should gather
the requested evidence, then retry the original deferred action for
reauthorization.

Example:
  1. An edit is proposed before src/foo.ts was read, so CodingActionGate returns DEFER.
  2. Run: coding-action-gate read src/foo.ts
  3. Run: coding-action-gate read test/foo.test.ts
  4. Run: coding-action-gate retry <deferredActionId>
  5. Retry may PROCEED, ESCALATE, or BLOCK depending on the gathered evidence.

DEFER is not failure. It is a safe autonomous repair loop before authorization.
`;

const policyHelp = `Policy:

CodingActionGate policy is enforcement configuration, usually stored in
coding-action-gate.policy.yml. Policy controls boundaries such as workspace scope,
sensitive paths, command risk, validation gates, Git landing rules, and
deploy/publish behavior.

Read-only policy commands (read-only, no mutation):
  coding-action-gate policy show
  coding-action-gate policy validate
  coding-action-gate policy explain

These commands do not edit policy, approve actions, override decisions, mutate
configuration, or change analytics settings. Policy editing is not implemented
in this batch. Analytics is controlled with CODING_ACTION_GATE_ANALYTICS=0, not policy.
This help topic does not edit policy.

Create a starter policy:
  coding-action-gate init --template basic
  coding-action-gate init --template node
  coding-action-gate init --template strict
  coding-action-gate init --template monorepo-lite

Run 'coding-action-gate doctor' after initialization to check project readiness.
`;

const securityHelp = `Security and privacy:

CodingActionGate is local-first. It records local-only product-behavior analytics under
.coding-action-gate/analytics/. No remote telemetry is sent.

Analytics records event categories such as decisions, DEFER recording, retries,
doctor/init/export-feedback runs, and UI launches. It does not record source
code, file contents, diffs, raw commands, raw paths, environment variables,
secrets, repo names, or validation logs. Disable local analytics with:
  CODING_ACTION_GATE_ANALYTICS=0

Secret-like values and sensitive data are redacted in CLI and audit output where
supported. Avoid pasting raw secrets into action files or support requests.

coding-action-gate exec remains dry-run only; it authorizes a command but does not execute
it. Dangerous commands should be BLOCKed, DEFERred, or ESCALATEd according to
policy and available evidence.

The dashboard API is localhost-only and read-only. The dashboard has no mutation
endpoints and cannot approve actions, retry actions, edit files, run commands,
or mutate policy.

Inspect local analytics with coding-action-gate analytics summary. Clear analytics events
only with coding-action-gate analytics clear --yes; this does not delete audit logs,
deferred actions, observations, validation state, or policy.
`;

const uiHelp = `Local dashboard:

coding-action-gate ui launches the local read-only dashboard and read-only API. It serves
local runtime state such as audit records, deferred actions, observations,
validation state, Git state, and policy visibility where available.

The dashboard does not approve actions, retry actions, edit files, run commands,
mutate policy, or send telemetry.

Installed local preview packages include bundled built UI assets from ui/dist.
Source checkout usage may require:
  npm run ui:build

If UI assets are missing, run npm run ui:build from a source checkout or
reinstall a beta tarball that includes ui/dist.
`;

const installHelp = `Private beta install:

From a source checkout:
  npm run build
  npm run ui:build
  npm pack
  npm install -g ./<tarball>
  coding-action-gate --version
  coding-action-gate doctor

Installed CLI vs source checkout:
  Installed coding-action-gate should work from any repository.
  Source checkouts may use node dist/cli/cli.js or npm scripts.

UI assets:
  Local preview packages include bundled ui/dist assets.
  Source checkouts may require npm run ui:build before coding-action-gate ui.

Uninstall:
  npm uninstall -g coding-action-gate

Reset local CodingActionGate state:
  Remove .coding-action-gate/ from a repository only when intentionally deleting local
  CodingActionGate runtime state. This deletes audit, deferred, validation, and
  observation state for that workspace.

Release candidate checks:
  npm run smoke:install is mandatory before sharing any beta tarball.
  A manual tarball install on a second clean machine or fresh VM is recommended
  before sharing with beta users.
`;

const firstRunHelp = `First run:

1. Install the local preview package.
2. Run: coding-action-gate --version
3. Run: coding-action-gate doctor
4. Initialize policy if needed: coding-action-gate init
5. Try a safe dry-run: coding-action-gate exec "echo hello"
6. Try a decision example if examples are available.
7. Launch the dashboard: coding-action-gate ui
8. Export sanitized feedback if needed: coding-action-gate export-feedback

Installed local preview packages include bundled ui/dist dashboard assets. Source
checkouts may require npm run ui:build before coding-action-gate ui.

CodingActionGate is local-first, coding-action-gate exec is dry-run only, and the dashboard is
read-only with no mutation endpoints or remote telemetry at this phase. Local
analytics can be disabled with CODING_ACTION_GATE_ANALYTICS=0.
`;

const analyticsHelp = `Local analytics:

CodingActionGate records local-only product-behavior analytics for beta calibration.
Events are stored in:
  .coding-action-gate/analytics/events.jsonl

No remote telemetry is sent. Analytics does not record raw paths, raw commands,
diffs, source code, file contents, environment variables, secrets, repo names,
or validation logs. Analytics is separate from audit logs and does not replace
the audit trail.

Inspect local aggregate behavior:
  coding-action-gate analytics summary

Clear local analytics events only:
  coding-action-gate analytics clear --yes

Clear does not delete audit logs, deferred actions, observations, validation
state, policy, or the rest of .coding-action-gate/.

Disable future analytics recording for a command or shell:
  CODING_ACTION_GATE_ANALYTICS=0

Persistent local enable/disable commands are not implemented yet.
`;

const topicText: Record<HelpTopic, string> = {
  decisions: decisionsHelp,
  defer: deferHelp,
  policy: policyHelp,
  security: securityHelp,
  ui: uiHelp,
  install: installHelp,
  analytics: analyticsHelp,
  "first-run": firstRunHelp
};

const isHelpTopic = (value: string): value is HelpTopic =>
  helpTopics.includes(value as HelpTopic);

export const formatHelpTopic = (
  topic?: string
):
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      text: string;
    } => {
  if (topic === undefined) {
    return {
      ok: true,
      text: mainHelp
    };
  }

  if (isHelpTopic(topic)) {
    return {
      ok: true,
      text: topicText[topic]
    };
  }

  return {
    ok: false,
    text: `Unknown help topic: ${topic}\n\nAvailable topics: ${availableTopicsText()}\n`
  };
};

export const runHelpCommand = (args: string[], io: CliIO): number => {
  if (args.length > 1) {
    io.stderr.write(
      `Expected at most one help topic.\n\nAvailable topics: ${availableTopicsText()}\n`
    );
    return cliExitCodes.error;
  }

  const result = formatHelpTopic(args[0]);

  if (result.ok) {
    io.stdout.write(`${result.text.trimEnd()}\n`);
    return cliExitCodes.success;
  }

  io.stderr.write(result.text);
  return cliExitCodes.error;
};
