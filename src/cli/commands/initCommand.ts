import { access, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { recordInitRun } from "../../analytics/analyticsRecorder.js";
import {
  getPolicyTemplate,
  policyTemplateNames
} from "../../policyTemplates/policyTemplates.js";
import { renderPolicyTemplate } from "../../policyTemplates/policyTemplateRenderer.js";
import type { PolicyTemplateName } from "../../policyTemplates/policyTemplateTypes.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { cliExitCodes } from "../exitCodes.js";
import type { CliIO } from "../cli.js";

export interface InitCommandOptions {
  cwd?: string;
  template?: string;
  out?: string;
  force?: boolean;
  json?: boolean;
}

export interface InitCommandOutput {
  ok: true;
  path: string;
  template: PolicyTemplateName;
  created: true;
  overwritten: boolean;
}

export type InitCommandResult =
  | {
      ok: true;
      output: InitCommandOutput;
      humanOutput: string;
    }
  | {
      ok: false;
      error: CliError;
    };

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const assertCwdExists = async (cwd: string): Promise<CliError | undefined> => {
  try {
    const stats = await stat(cwd);

    if (!stats.isDirectory()) {
      return createCliError(
        "CLI_INIT_CWD_NOT_FOUND",
        `Project directory is not a directory: ${cwd}`
      );
    }

    return undefined;
  } catch {
    return createCliError(
      "CLI_INIT_CWD_NOT_FOUND",
      `Project directory does not exist: ${cwd}`
    );
  }
};

export const resolveInitOutputPath = (cwd: string, out?: string): string =>
  out === undefined
    ? path.resolve(cwd, "stepharbor.policy.yml")
    : path.isAbsolute(out)
      ? path.resolve(out)
      : path.resolve(cwd, out);

export const formatInitHuman = (output: InitCommandOutput): string => {
  const actionLabel = output.overwritten ? "Overwritten:" : "Created:";

  return (
    [
      "StepHarbor policy initialized",
      "",
      "Template:",
      `  ${output.template}`,
      "",
      actionLabel,
      `  ${output.path}`,
      "",
      "Next steps:",
      "  1. Review the generated policy.",
      "  2. Run: stepharbor doctor",
      "  3. Run: stepharbor ui --cwd ."
    ].join("\n") + "\n"
  );
};

export const runInitCommand = async (
  options: InitCommandOptions
): Promise<InitCommandResult> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const cwdError = await assertCwdExists(cwd);

  if (cwdError !== undefined) {
    return {
      ok: false,
      error: cwdError
    };
  }

  const templateName = options.template ?? "basic";
  const template = getPolicyTemplate(templateName);

  if (template === undefined) {
    return {
      ok: false,
      error: createCliError(
        "CLI_INIT_UNKNOWN_TEMPLATE",
        `Unknown policy template: ${templateName}. Supported templates: ${policyTemplateNames.join(", ")}.`
      )
    };
  }

  const outPath = resolveInitOutputPath(cwd, options.out);
  const exists = await fileExists(outPath);

  if (exists && options.force !== true) {
    return {
      ok: false,
      error: createCliError(
        "CLI_INIT_POLICY_EXISTS",
        "Policy file already exists. Use --force to overwrite.",
        {
          path: outPath
        }
      )
    };
  }

  const rendered = renderPolicyTemplate(template.name);

  if (rendered === null) {
    return {
      ok: false,
      error: createCliError(
        "CLI_INIT_UNKNOWN_TEMPLATE",
        `Unknown policy template: ${templateName}.`
      )
    };
  }

  try {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, rendered, "utf8");
  } catch (error) {
    return {
      ok: false,
      error: createCliError(
        "CLI_INIT_ERROR",
        error instanceof Error ? error.message : "Failed to write policy file."
      )
    };
  }

  const output: InitCommandOutput = {
    ok: true,
    path: outPath,
    template: template.name,
    created: true,
    overwritten: exists
  };

  return {
    ok: true,
    output,
    humanOutput: formatInitHuman(output)
  };
};

export const runInitCliCommand = async (
  options: InitCommandOptions,
  io: CliIO
): Promise<number> => {
  const result = await runInitCommand(options);
  await recordInitRun({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    result: result.ok
      ? "created"
      : result.error.code === "CLI_INIT_POLICY_EXISTS"
        ? "already_initialized"
        : "failed",
    ...((result.ok ? result.output.template : options.template) !== undefined
      ? { template: result.ok ? result.output.template : options.template }
      : {})
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
        `StepHarbor error [${result.error.code}]: ${result.error.message}\n`
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
