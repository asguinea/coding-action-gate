import { clearAnalyticsEvents } from "../../analytics/analyticsStore.js";
import {
  analyticsStorageRelativePath,
  buildAnalyticsSummary,
  formatAnalyticsSummary
} from "../../analytics/analyticsSummary.js";
import { cliExitCodes } from "../exitCodes.js";
import type { CliIO } from "../cli.js";

export interface AnalyticsCommandOptions {
  subcommand?: "summary" | "clear";
  cwd?: string;
  json?: boolean;
  yes?: boolean;
}

export const analyticsCommandHelp = `Usage:
  stepharbor analytics
  stepharbor analytics summary [--json] [--cwd <path>]
  stepharbor analytics clear --yes [--cwd <path>]

Local analytics commands:
  summary   Summarize local product-behavior analytics.
  clear     Clear local analytics events only.

Analytics is local-only. It is stored at ${analyticsStorageRelativePath} and
does not send remote telemetry. It does not include source code, diffs, raw
commands, raw paths, environment variables, secrets, repo names, or validation
logs.

Recording can be disabled for a command or shell with:
  STEPHARBOR_ANALYTICS=0
`;

const clearWithoutConfirmationText = `This will delete local StepHarbor analytics events only.
It will not delete audit logs, deferred actions, observations, validation state, or policy.
Run \`stepharbor analytics clear --yes\` to confirm.
`;

export const runAnalyticsCommand = async (
  options: AnalyticsCommandOptions,
  io: CliIO
): Promise<number> => {
  if (options.subcommand === undefined) {
    io.stdout.write(analyticsCommandHelp);
    return cliExitCodes.success;
  }

  if (options.subcommand === "summary") {
    const summary = await buildAnalyticsSummary({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {})
    });

    if (options.json === true) {
      io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      io.stdout.write(`${formatAnalyticsSummary(summary).trimEnd()}\n`);
    }

    return cliExitCodes.success;
  }

  if (options.yes !== true) {
    io.stdout.write(clearWithoutConfirmationText);
    return cliExitCodes.success;
  }

  await clearAnalyticsEvents({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {})
  });
  io.stdout.write(
    `Cleared local StepHarbor analytics events at ${analyticsStorageRelativePath}.\n` +
      "Audit logs, deferred actions, observations, validation state, and policy were not changed.\n"
  );

  return cliExitCodes.success;
};
