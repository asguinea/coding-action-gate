import { exportFeedbackBundle } from "../../feedback/feedbackExporter.js";
import { recordExportFeedbackRun } from "../../analytics/analyticsRecorder.js";
import type {
  FeedbackCommandOutput,
  FeedbackExportOptions
} from "../../feedback/feedbackTypes.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { cliExitCodes } from "../exitCodes.js";
import type { CliIO } from "../cli.js";

export interface ExportFeedbackCommandOptions extends FeedbackExportOptions {
  json?: boolean;
}

export type ExportFeedbackCommandResult =
  | {
      ok: true;
      output: FeedbackCommandOutput;
      humanOutput: string;
    }
  | {
      ok: false;
      error: CliError;
    };

const toFeedbackCliError = (error: unknown): CliError => {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Failed to export CodingActionGate feedback.";

  if (message.startsWith("Feedback output already exists:")) {
    return createCliError("CLI_FEEDBACK_OUTPUT_EXISTS", message);
  }

  return createCliError("CLI_FEEDBACK_EXPORT_ERROR", message);
};

export const formatExportFeedbackHuman = (
  output: FeedbackCommandOutput
): string =>
  [
    "CodingActionGate feedback export created:",
    `  ${output.path}`,
    "",
    "Included:",
    `  audit records: ${output.summary.auditRecords}`,
    `  deferred actions: ${output.summary.deferredActions}`,
    `  validation records: ${output.summary.validationRecords}`,
    "",
    "Redaction:",
    "  enabled"
  ].join("\n") + "\n";

export const runExportFeedback = async (
  options: ExportFeedbackCommandOptions
): Promise<ExportFeedbackCommandResult> => {
  try {
    const result = await exportFeedbackBundle(options);
    const output: FeedbackCommandOutput = {
      ok: true,
      path: result.path,
      summary: result.summary,
      redacted: true
    };

    return {
      ok: true,
      output,
      humanOutput: formatExportFeedbackHuman(output)
    };
  } catch (error) {
    return {
      ok: false,
      error: toFeedbackCliError(error)
    };
  }
};

export const runExportFeedbackCommand = async (
  options: ExportFeedbackCommandOptions,
  io: CliIO
): Promise<number> => {
  const result = await runExportFeedback(options);
  await recordExportFeedbackRun({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    result: result.ok ? "created" : "failed"
  });

  if (!result.ok) {
    const errorOutput = {
      ok: false,
      error: result.error
    };

    if (options.json === true) {
      io.stdout.write(`${JSON.stringify(errorOutput, null, 2)}\n`);
    } else {
      io.stderr.write(
        `CodingActionGate error [${result.error.code}]: ${result.error.message}\n`
      );
    }

    return cliExitCodes.error;
  }

  if (options.json === true) {
    io.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
  } else {
    io.stdout.write(result.humanOutput);
  }

  return cliExitCodes.success;
};
