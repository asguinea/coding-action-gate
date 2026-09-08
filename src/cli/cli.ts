#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cliExitCodes, exitCodeForDecision } from "./exitCodes.js";
import { createCliError } from "./cliErrors.js";
import {
  formatHumanError,
  formatHumanSuccess,
  formatJsonOutput,
  type CliErrorOutput
} from "./cliOutput.js";
import {
  runDecideCommand,
  type DecideCommandOptions
} from "./commands/decideCommand.js";
import {
  runExecCommand,
  type ExecCommandOptions
} from "./commands/execCommand.js";
import {
  runReadCommand,
  type ReadCommandOptions
} from "./commands/readCommand.js";
import {
  runRetryCommand,
  type RetryCommandOptions
} from "./commands/retryCommand.js";
import {
  runValidateCommand,
  type ValidateCommandOptions
} from "./commands/validateCommand.js";
import {
  runUiCommand,
  validateUiPort,
  type UiCommandOptions
} from "./commands/uiCommand.js";
import {
  runDoctorCommand,
  type DoctorCommandOptions
} from "./commands/doctorCommand.js";
import {
  runExportFeedbackCommand,
  type ExportFeedbackCommandOptions
} from "./commands/exportFeedbackCommand.js";
import {
  runInitCliCommand,
  type InitCommandOptions
} from "./commands/initCommand.js";
import {
  runAnalyticsCommand,
  type AnalyticsCommandOptions
} from "./commands/analyticsCommand.js";
import {
  runPolicyCommand,
  type PolicyCommandOptions
} from "./commands/policyCommand.js";
import { runHelpCommand } from "./commands/helpCommand.js";
import { formatStepHarborVersion } from "../version.js";

export interface CliIO {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

const usage = `Usage:
  stepharbor decide <actionFile> [options]
  stepharbor exec "<command>" [options]
  stepharbor read <path> [options]
  stepharbor retry <deferredActionId> [options]
  stepharbor validate <kind> [options]
  stepharbor validate [kind] --command "<command>" [options]
  stepharbor ui [options]
  stepharbor doctor [options]
  stepharbor export-feedback [options]
  stepharbor init [options]
  stepharbor analytics <summary|clear> [options]
  stepharbor policy <show|validate|explain> [options]
  stepharbor help [topic]
  stepharbor version

stepharbor ui starts the read-only local dashboard API and serves the UI when a build is available.
stepharbor decide authorizes an action JSON file without executing or applying the action.
stepharbor exec authorizes a shell command as a dry-run only; the command is not executed.
stepharbor read performs an authorized file read and records a local observation.
stepharbor retry reauthorizes a deferred action after evidence is gathered; it does not execute it.
stepharbor validate explicitly runs an authorized validation command and records the result.
stepharbor doctor runs read-only project readiness checks.
stepharbor export-feedback writes a sanitized local JSON feedback bundle.
stepharbor init writes a starter StepHarbor policy file.
stepharbor analytics summarizes or clears local product-behavior analytics.
stepharbor policy shows, validates, and explains the effective read-only policy.
stepharbor help explains private-beta workflows and topics such as decisions, defer, policy, security, ui, install, analytics, and first-run.

Options:
  --policy <path>        Explicit policy path.
  --cwd <path>           Working directory for discovery and normalization.
  --audit-dir <path>     Directory for audit logs.
  --json                 Print machine-readable JSON only.
  --no-audit             Do not write an audit record.
  --session-id <id>      Session id for audit metadata.
  --user-id <id>         User id for audit metadata.
  --agent-id <id>        Agent id for audit metadata.
  --repo-id <id>         Repository id for audit metadata.
  --workspace-id <id>    Workspace id for audit metadata.
  --command-id <id>      Action id for generated exec action.
  --metadata-only        Record file metadata without printing content.
  --no-content           Alias for --metadata-only.
  --observation-dir <path>
                         Directory for file observation logs.
  --defer-dir <path>     Directory for deferred action registry logs.
  --validation-dir <path>
                         Directory for validation result logs.
  --command <command>    Explicit validation command for validate.
  --timeout-ms <number>  Validation command timeout in milliseconds.
  --max-output-bytes <number>
                         Maximum validation output bytes to summarize.
  --max-bytes <number>   Maximum bytes to print/read for read command.
  --host <host>          UI/API host for stepharbor ui. Must be localhost-only.
  --api-port <number>    API port for stepharbor ui.
  --ui-port <number>     UI server port for stepharbor ui.
  --mock                 Launch UI in Mock Demo mode.
  --live                 Launch UI in Live Local mode.
  --no-open              Do not attempt to open the browser.
  --open                 Attempt to open the browser, if supported.
  --no-ui-server         Start read-only API only and print UI instructions.
  --check-api-port <number>
                         Localhost API port to test for doctor.
  --skip-port-check      Skip doctor localhost API port availability check.
  --out <path>           Output path for export-feedback JSON.
  --limit <number>       Max audit records for export-feedback.
  --template <name>      Policy template for init: basic, node, strict, monorepo-lite.
  --force                Overwrite existing init output policy.
  --yes                  Confirm analytics clear.
  --version              Print the StepHarbor version.
  --help                 Show command usage.

More help:
  stepharbor help
  stepharbor help <topic>
`;

export const getCliUsage = (): string => usage;

const optionNamesWithValues = new Set([
  "--policy",
  "--cwd",
  "--audit-dir",
  "--session-id",
  "--user-id",
  "--agent-id",
  "--repo-id",
  "--workspace-id",
  "--command-id"
]);

const decideOptionNamesWithValues = new Set([
  ...optionNamesWithValues,
  "--observation-dir",
  "--defer-dir"
]);

const readOptionNamesWithValues = new Set([
  ...optionNamesWithValues,
  "--observation-dir",
  "--max-bytes"
]);

const retryOptionNamesWithValues = new Set([
  ...optionNamesWithValues,
  "--observation-dir",
  "--defer-dir"
]);

const validateOptionNamesWithValues = new Set([
  ...optionNamesWithValues,
  "--validation-dir",
  "--command",
  "--timeout-ms",
  "--max-output-bytes"
]);

const uiOptionNamesWithValues = new Set([
  "--policy",
  "--cwd",
  "--host",
  "--api-port",
  "--ui-port",
  "--session-id"
]);

const doctorOptionNamesWithValues = new Set([
  "--cwd",
  "--policy",
  "--check-api-port"
]);

const exportFeedbackOptionNamesWithValues = new Set([
  "--cwd",
  "--policy",
  "--out",
  "--session-id",
  "--audit-dir",
  "--defer-dir",
  "--observation-dir",
  "--validation-dir",
  "--limit"
]);

const initOptionNamesWithValues = new Set(["--cwd", "--template", "--out"]);

const analyticsOptionNamesWithValues = new Set(["--cwd"]);

const policyOptionNamesWithValues = new Set(["--cwd", "--policy"]);

const assignOption = (
  options: Partial<DecideCommandOptions>,
  name: string,
  value: string
): void => {
  switch (name) {
    case "--policy":
      options.policy = value;
      break;
    case "--cwd":
      options.cwd = value;
      break;
    case "--audit-dir":
      options.auditDir = value;
      break;
    case "--session-id":
      options.sessionId = value;
      break;
    case "--user-id":
      options.userId = value;
      break;
    case "--agent-id":
      options.agentId = value;
      break;
    case "--repo-id":
      options.repoId = value;
      break;
    case "--workspace-id":
      options.workspaceId = value;
      break;
  }
};

const assignDecideOption = (
  options: Partial<DecideCommandOptions>,
  name: string,
  value: string
): void => {
  assignOption(options, name, value);

  if (name === "--observation-dir") {
    options.observationDir = value;
  }

  if (name === "--defer-dir") {
    options.deferDir = value;
  }
};

const assignExecOption = (
  options: Partial<ExecCommandOptions>,
  name: string,
  value: string
): void => {
  assignOption(options, name, value);

  if (name === "--command-id") {
    options.commandId = value;
  }
};

const assignReadOption = (
  options: Partial<ReadCommandOptions>,
  name: string,
  value: string
): ReturnType<typeof createCliError> | undefined => {
  assignOption(options, name, value);

  if (name === "--observation-dir") {
    options.observationDir = value;
  }

  if (name === "--max-bytes") {
    const maxBytes = Number(value);

    if (!Number.isInteger(maxBytes) || maxBytes < 0) {
      return createCliError(
        "CLI_BAD_ARGUMENTS",
        "--max-bytes must be a non-negative integer."
      );
    }

    options.maxBytes = maxBytes;
  }

  return undefined;
};

const assignRetryOption = (
  options: Partial<RetryCommandOptions>,
  name: string,
  value: string
): void => {
  assignOption(options, name, value);

  if (name === "--observation-dir") {
    options.observationDir = value;
  }

  if (name === "--defer-dir") {
    options.deferDir = value;
  }
};

const assignValidateOption = (
  options: Partial<ValidateCommandOptions>,
  name: string,
  value: string
): ReturnType<typeof createCliError> | undefined => {
  assignOption(options, name, value);

  if (name === "--validation-dir") {
    options.validationDir = value;
  }

  if (name === "--command") {
    options.command = value;
  }

  if (name === "--timeout-ms") {
    const timeoutMs = Number(value);

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      return createCliError(
        "CLI_BAD_ARGUMENTS",
        "--timeout-ms must be a positive integer."
      );
    }

    options.timeoutMs = timeoutMs;
  }

  if (name === "--max-output-bytes") {
    const maxOutputBytes = Number(value);

    if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 0) {
      return createCliError(
        "CLI_BAD_ARGUMENTS",
        "--max-output-bytes must be a non-negative integer."
      );
    }

    options.maxOutputBytes = maxOutputBytes;
  }

  return undefined;
};

export const parseDecideArgs = (
  args: string[]
):
  | {
      ok: true;
      options: DecideCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<DecideCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-audit") {
      options.noAudit = true;
      continue;
    }

    if (decideOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      assignDecideOption(options, arg, value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length !== 1 || positional[0] === undefined) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Expected exactly one action file."
      )
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      actionFile: positional[0]
    }
  };
};

export const parseExecArgs = (
  args: string[]
):
  | {
      ok: true;
      options: ExecCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<ExecCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-audit") {
      options.noAudit = true;
      continue;
    }

    if (optionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      assignExecOption(options, arg, value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length !== 1 || positional[0] === undefined) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Missing command string for exec."
      )
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      command: positional[0]
    }
  };
};

export const parseReadArgs = (
  args: string[]
):
  | {
      ok: true;
      options: ReadCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<ReadCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-audit") {
      options.noAudit = true;
      continue;
    }

    if (arg === "--metadata-only" || arg === "--no-content") {
      options.metadataOnly = true;
      continue;
    }

    if (readOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      const optionError = assignReadOption(options, arg, value);

      if (optionError !== undefined) {
        return {
          ok: false,
          error: optionError
        };
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length !== 1 || positional[0] === undefined) {
    return {
      ok: false,
      error: createCliError("CLI_BAD_ARGUMENTS", "Expected exactly one path.")
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      targetPath: positional[0]
    }
  };
};

export const parseRetryArgs = (
  args: string[]
):
  | {
      ok: true;
      options: RetryCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<RetryCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-audit") {
      options.noAudit = true;
      continue;
    }

    if (retryOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      assignRetryOption(options, arg, value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length !== 1 || positional[0] === undefined) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Expected exactly one deferred action id."
      )
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      deferredActionId: positional[0]
    }
  };
};

export const parseValidateArgs = (
  args: string[]
):
  | {
      ok: true;
      options: ValidateCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<ValidateCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-audit") {
      options.noAudit = true;
      continue;
    }

    if (validateOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      const optionError = assignValidateOption(options, arg, value);

      if (optionError !== undefined) {
        return {
          ok: false,
          error: optionError
        };
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Expected at most one validation kind."
      )
    };
  }

  if (positional.length === 0 && options.command === undefined) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Expected a validation kind or --command."
      )
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      ...(positional[0] !== undefined ? { kindOrCommand: positional[0] } : {})
    }
  };
};

const assignUiOption = (
  options: Partial<UiCommandOptions>,
  name: string,
  value: string
): ReturnType<typeof createCliError> | undefined => {
  switch (name) {
    case "--cwd":
      options.cwd = value;
      break;
    case "--policy":
      options.policy = value;
      break;
    case "--host":
      options.host = value;
      break;
    case "--session-id":
      options.sessionId = value;
      break;
    case "--api-port": {
      const port = Number(value);

      try {
        options.apiPort = validateUiPort(port, "api");
      } catch (error) {
        return error as ReturnType<typeof createCliError>;
      }

      break;
    }
    case "--ui-port": {
      const port = Number(value);

      try {
        options.uiPort = validateUiPort(port, "ui");
      } catch (error) {
        return error as ReturnType<typeof createCliError>;
      }

      break;
    }
  }

  return undefined;
};

export const parseUiArgs = (
  args: string[]
):
  | {
      ok: true;
      options: UiCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const options: Partial<UiCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--mock") {
      options.mode = "mock";
      continue;
    }

    if (arg === "--live") {
      options.mode = "live";
      continue;
    }

    if (arg === "--no-open") {
      options.noOpen = true;
      continue;
    }

    if (arg === "--open") {
      options.open = true;
      continue;
    }

    if (arg === "--no-ui-server") {
      options.noUiServer = true;
      continue;
    }

    if (uiOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      const optionError = assignUiOption(options, arg, value);

      if (optionError !== undefined) {
        return {
          ok: false,
          error: optionError
        };
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "stepharbor ui does not accept positional arguments."
      )
    };
  }

  return {
    ok: true,
    options
  };
};

const parseDoctorPort = (
  value: string
):
  | { ok: true; port: number }
  | { ok: false; error: ReturnType<typeof createCliError> } => {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "--check-api-port must be an integer between 1 and 65535."
      )
    };
  }

  return {
    ok: true,
    port
  };
};

export const parseDoctorArgs = (
  args: string[]
):
  | {
      ok: true;
      options: DoctorCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const options: Partial<DoctorCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--skip-port-check") {
      options.skipPortCheck = true;
      continue;
    }

    if (doctorOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      if (arg === "--cwd") {
        options.cwd = value;
      } else if (arg === "--policy") {
        options.policy = value;
      } else if (arg === "--check-api-port") {
        const port = parseDoctorPort(value);

        if (!port.ok) {
          return {
            ok: false,
            error: port.error
          };
        }

        options.checkApiPort = port.port;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "stepharbor doctor does not accept positional arguments."
      )
    };
  }

  return {
    ok: true,
    options
  };
};

const parsePositiveIntegerOption = (
  value: string,
  name: string
):
  | { ok: true; value: number }
  | { ok: false; error: ReturnType<typeof createCliError> } => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        `${name} must be a positive integer.`
      )
    };
  }

  return {
    ok: true,
    value: parsed
  };
};

export const parseExportFeedbackArgs = (
  args: string[]
):
  | {
      ok: true;
      options: ExportFeedbackCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const options: Partial<ExportFeedbackCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (exportFeedbackOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      if (arg === "--cwd") {
        options.cwd = value;
      } else if (arg === "--policy") {
        options.policy = value;
      } else if (arg === "--out") {
        options.out = value;
      } else if (arg === "--session-id") {
        options.sessionId = value;
      } else if (arg === "--audit-dir") {
        options.auditDir = value;
      } else if (arg === "--defer-dir") {
        options.deferDir = value;
      } else if (arg === "--observation-dir") {
        options.observationDir = value;
      } else if (arg === "--validation-dir") {
        options.validationDir = value;
      } else if (arg === "--limit") {
        const limit = parsePositiveIntegerOption(value, "--limit");

        if (!limit.ok) {
          return {
            ok: false,
            error: limit.error
          };
        }

        options.limit = limit.value;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "stepharbor export-feedback does not accept positional arguments."
      )
    };
  }

  return {
    ok: true,
    options
  };
};

export const parseInitArgs = (
  args: string[]
):
  | {
      ok: true;
      options: InitCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const options: Partial<InitCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (initOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      if (arg === "--cwd") {
        options.cwd = value;
      } else if (arg === "--template") {
        options.template = value;
      } else if (arg === "--out") {
        options.out = value;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "stepharbor init does not accept positional arguments."
      )
    };
  }

  return {
    ok: true,
    options
  };
};

export const parseAnalyticsArgs = (
  args: string[]
):
  | {
      ok: true;
      options: AnalyticsCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<AnalyticsCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--yes") {
      options.yes = true;
      continue;
    }

    if (analyticsOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      if (arg === "--cwd") {
        options.cwd = value;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Expected at most one analytics subcommand."
      )
    };
  }

  const subcommand = positional[0];

  if (
    subcommand !== undefined &&
    subcommand !== "summary" &&
    subcommand !== "clear"
  ) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        `Unknown analytics subcommand: ${subcommand}.`
      )
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      ...(subcommand !== undefined ? { subcommand } : {})
    }
  };
};

export const parsePolicyArgs = (
  args: string[]
):
  | {
      ok: true;
      options: PolicyCommandOptions;
    }
  | {
      ok: false;
      error: ReturnType<typeof createCliError>;
    } => {
  const positional: string[] = [];
  const options: Partial<PolicyCommandOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (policyOptionNamesWithValues.has(arg)) {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: createCliError(
            "CLI_BAD_ARGUMENTS",
            `Missing value for ${arg}.`
          )
        };
      }

      if (arg === "--cwd") {
        options.cwd = value;
      } else if (arg === "--policy") {
        options.policy = value;
      }

      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        error: createCliError("CLI_BAD_ARGUMENTS", `Unknown option: ${arg}.`)
      };
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Expected at most one policy subcommand."
      )
    };
  }

  const subcommand = positional[0];

  if (
    subcommand !== undefined &&
    subcommand !== "show" &&
    subcommand !== "validate" &&
    subcommand !== "explain"
  ) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        `Unknown policy subcommand: ${subcommand}.`
      )
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      ...(subcommand !== undefined ? { subcommand } : {})
    }
  };
};

const writeError = (error: CliErrorOutput, json: boolean, io: CliIO): void => {
  if (json) {
    io.stdout.write(formatJsonOutput(error));
    return;
  }

  io.stderr.write(formatHumanError(error.error));
};

export const runCli = async (
  args: string[],
  io: CliIO = {
    stdout: process.stdout,
    stderr: process.stderr
  }
): Promise<number> => {
  const [command, ...rest] = args;
  const wantsHelp = args.includes("--help") || args.includes("-h");
  const wantsVersion = args.includes("--version");
  const wantsJson = args.includes("--json");

  if (wantsVersion || command === "version") {
    io.stdout.write(`${formatStepHarborVersion()}\n`);
    return cliExitCodes.success;
  }

  if (wantsHelp) {
    io.stdout.write(getCliUsage());
    return cliExitCodes.success;
  }

  if (command === "help") {
    return runHelpCommand(rest, io);
  }

  if (
    command !== "decide" &&
    command !== "exec" &&
    command !== "read" &&
    command !== "retry" &&
    command !== "validate" &&
    command !== "ui" &&
    command !== "doctor" &&
    command !== "export-feedback" &&
    command !== "init" &&
    command !== "analytics" &&
    command !== "policy" &&
    command !== "help" &&
    command !== "version"
  ) {
    writeError(
      {
        ok: false,
        error: createCliError(
          "CLI_BAD_ARGUMENTS",
          command === undefined
            ? "Missing command."
            : `Unknown command: ${command}.`
        )
      },
      wantsJson,
      io
    );
    return cliExitCodes.error;
  }

  const parsed =
    command === "decide"
      ? parseDecideArgs(rest)
      : command === "exec"
        ? parseExecArgs(rest)
        : command === "read"
          ? parseReadArgs(rest)
          : command === "retry"
            ? parseRetryArgs(rest)
            : command === "validate"
              ? parseValidateArgs(rest)
              : command === "ui"
                ? parseUiArgs(rest)
                : command === "doctor"
                  ? parseDoctorArgs(rest)
                  : command === "export-feedback"
                    ? parseExportFeedbackArgs(rest)
                    : command === "init"
                      ? parseInitArgs(rest)
                      : command === "analytics"
                        ? parseAnalyticsArgs(rest)
                        : parsePolicyArgs(rest);

  if (!parsed.ok) {
    writeError(
      {
        ok: false,
        error: parsed.error
      },
      wantsJson,
      io
    );
    return cliExitCodes.error;
  }

  if (command === "ui") {
    return runUiCommand(parsed.options as UiCommandOptions, io);
  }

  if (command === "doctor") {
    return runDoctorCommand(parsed.options as DoctorCommandOptions, io);
  }

  if (command === "export-feedback") {
    return runExportFeedbackCommand(
      parsed.options as ExportFeedbackCommandOptions,
      io
    );
  }

  if (command === "init") {
    return runInitCliCommand(parsed.options as InitCommandOptions, io);
  }

  if (command === "analytics") {
    return runAnalyticsCommand(parsed.options as AnalyticsCommandOptions, io);
  }

  if (command === "policy") {
    return runPolicyCommand(parsed.options as PolicyCommandOptions, io);
  }

  const commandOptions = parsed.options as
    | DecideCommandOptions
    | ExecCommandOptions
    | ReadCommandOptions
    | RetryCommandOptions
    | ValidateCommandOptions
    | DoctorCommandOptions
    | ExportFeedbackCommandOptions
    | InitCommandOptions
    | AnalyticsCommandOptions
    | PolicyCommandOptions;

  const result =
    command === "decide"
      ? await runDecideCommand(commandOptions as DecideCommandOptions)
      : command === "exec"
        ? await runExecCommand(commandOptions as ExecCommandOptions)
        : command === "read"
          ? await runReadCommand(commandOptions as ReadCommandOptions)
          : command === "retry"
            ? await runRetryCommand(commandOptions as RetryCommandOptions)
            : await runValidateCommand(
                commandOptions as ValidateCommandOptions
              );

  if (!result.ok) {
    writeError(
      {
        ok: false,
        error: result.error
      },
      commandOptions.json === true,
      io
    );
    return cliExitCodes.error;
  }

  if (commandOptions.json === true) {
    io.stdout.write(formatJsonOutput(result.output));
  } else {
    io.stdout.write(formatHumanSuccess(result.output));
  }

  if (
    result.output.validation?.executed === true &&
    result.output.validation.status === "failed"
  ) {
    return cliExitCodes.validationFailed;
  }

  return exitCodeForDecision(result.output.decision.decision);
};

const isCliEntrypoint = (): boolean => {
  const scriptPath = process.argv[1];

  if (scriptPath === undefined) {
    return false;
  }

  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) === realpathSync(scriptPath)
    );
  } catch {
    return false;
  }
};

if (isCliEntrypoint()) {
  const exitCode = await runCli(process.argv.slice(2));

  process.exitCode = exitCode;
}
