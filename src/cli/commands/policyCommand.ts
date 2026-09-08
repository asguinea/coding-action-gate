import { loadPolicy } from "../../policy/loadPolicy.js";
import {
  createPolicyShowResult,
  explainPolicy,
  summarizePolicyErrorSource,
  summarizePolicyValidationError,
  summarizePolicySource
} from "../../policy/policyReporter.js";
import { cliExitCodes } from "../exitCodes.js";
import type { CliIO } from "../cli.js";

export interface PolicyCommandOptions {
  subcommand?: "show" | "validate" | "explain";
  cwd?: string;
  policy?: string;
  json?: boolean;
}

export const policyCommandHelp = `Usage:
  stepharbor policy
  stepharbor policy show [--policy <path>] [--cwd <path>] [--json]
  stepharbor policy validate [--policy <path>] [--cwd <path>] [--json]
  stepharbor policy explain [--policy <path>] [--cwd <path>] [--json]

Read-only policy commands:
  show       Show effective policy source and sanitized section summary.
  validate   Validate the effective policy and report schema/YAML issues.
  explain    Explain practical policy behavior for private beta users.

These commands do not edit policy, approve actions, override decisions, or
change analytics settings.
`;

const loadPolicyForCommand = async (options: PolicyCommandOptions) =>
  loadPolicy({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.policy !== undefined ? { explicitPath: options.policy } : {})
  });

const commandCwd = (options: PolicyCommandOptions): string =>
  options.cwd ?? process.cwd();

const formatPolicyShow = (
  result: ReturnType<typeof createPolicyShowResult> extends infer T ? T : never
): string => {
  const show = result as ReturnType<typeof createPolicyShowResult>;
  const summary = show.summary;
  const lines = [
    "StepHarbor Policy",
    "",
    `Source: ${show.source.label} (${show.source.kind})`,
    `Version: ${summary.version}`,
    `Sections: ${summary.sections.length > 0 ? summary.sections.join(", ") : "none"}`,
    "",
    "Workspace:",
    `- Allowed root patterns: ${summary.workspace.allowedRootCount}`,
    `- Block mutation outside workspace: ${String(summary.workspace.forbiddenMutationOutsideWorkspace)}`,
    "",
    "Sensitive paths:",
    `- Critical patterns: ${summary.sensitivePathCounts.critical}`,
    `- High patterns: ${summary.sensitivePathCounts.high}`,
    `- Medium patterns: ${summary.sensitivePathCounts.medium}`,
    "",
    "Validation:",
    `- Before commit required: ${String(summary.validation.beforeCommitRequired)} (${summary.validation.beforeCommitCommandCount} command pattern(s))`,
    `- Before push required: ${String(summary.validation.beforePushRequired)} (${summary.validation.beforePushCommandCount} command pattern(s))`,
    "",
    "Rules:",
    `- Total: ${summary.rules.total}`,
    `- PROCEED: ${summary.rules.proceed}`,
    `- DEFER: ${summary.rules.defer}`,
    `- ESCALATE: ${summary.rules.escalate}`,
    `- BLOCK: ${summary.rules.block}`
  ];

  if (summary.sensitivePatterns.critical.length > 0) {
    lines.push("", "Critical sensitive path patterns:");
    lines.push(
      ...summary.sensitivePatterns.critical.map((pattern) => `- ${pattern}`)
    );
  }

  if (summary.sensitivePatterns.high.length > 0) {
    lines.push("", "High sensitive path patterns:");
    lines.push(
      ...summary.sensitivePatterns.high.map((pattern) => `- ${pattern}`)
    );
  }

  if (summary.rules.ids.length > 0) {
    lines.push("", "Rule ids:");
    lines.push(...summary.rules.ids.map((id) => `- ${id}`));
  }

  lines.push(
    "",
    `Available templates: ${show.availableTemplates.join(", ")}`,
    "Policy commands are read-only."
  );

  return lines.join("\n");
};

const formatPolicyValidation = (
  validation:
    | ReturnType<typeof summarizePolicyValidationError>
    | {
        ok: true;
        source: ReturnType<typeof summarizePolicySource>;
        issues: [];
      }
): string => {
  if (validation.ok) {
    return [
      "Policy validation: PASS",
      `Source: ${validation.source.label}`,
      "No schema errors found."
    ].join("\n");
  }

  return [
    "Policy validation: FAIL",
    `Source: ${validation.source.label}`,
    "",
    "Issues:",
    ...validation.issues.map((issue, index) => `${index + 1}. ${issue.message}`)
  ].join("\n");
};

export const runPolicyCommand = async (
  options: PolicyCommandOptions,
  io: CliIO
): Promise<number> => {
  if (options.subcommand === undefined) {
    io.stdout.write(policyCommandHelp);
    return cliExitCodes.success;
  }

  const cwd = commandCwd(options);
  const policyResult = await loadPolicyForCommand(options);

  if (!policyResult.ok) {
    if (options.subcommand === "validate") {
      const validation = summarizePolicyValidationError(
        policyResult.error,
        cwd
      );
      io.stdout.write(
        options.json === true
          ? `${JSON.stringify(validation, null, 2)}\n`
          : `${formatPolicyValidation(validation)}\n`
      );
      return cliExitCodes.error;
    }

    const source = summarizePolicyErrorSource(policyResult.error, cwd);
    const message = [
      `Policy could not be loaded from ${source.label}.`,
      "Run `stepharbor policy validate` for schema and YAML details."
    ].join("\n");

    if (options.json === true) {
      io.stdout.write(
        `${JSON.stringify(
          {
            ok: false,
            source,
            message
          },
          null,
          2
        )}\n`
      );
    } else {
      io.stderr.write(`${message}\n`);
    }

    return cliExitCodes.error;
  }

  if (options.subcommand === "show") {
    const show = createPolicyShowResult(
      policyResult.policy,
      policyResult.source,
      cwd
    );
    io.stdout.write(
      options.json === true
        ? `${JSON.stringify(show, null, 2)}\n`
        : `${formatPolicyShow(show)}\n`
    );
    return cliExitCodes.success;
  }

  if (options.subcommand === "validate") {
    const validation = {
      ok: true as const,
      source: summarizePolicySource(policyResult.source, cwd),
      issues: [] as []
    };
    io.stdout.write(
      options.json === true
        ? `${JSON.stringify(validation, null, 2)}\n`
        : `${formatPolicyValidation(validation)}\n`
    );
    return cliExitCodes.success;
  }

  const explanation = explainPolicy(
    policyResult.policy,
    policyResult.source,
    cwd
  );
  io.stdout.write(
    options.json === true
      ? `${JSON.stringify(
          {
            source: summarizePolicySource(policyResult.source, cwd),
            explanation
          },
          null,
          2
        )}\n`
      : `${explanation.join("\n")}\n`
  );
  return cliExitCodes.success;
};
