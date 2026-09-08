import { randomBytes, createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";

import { getGitState } from "../git/gitStateReader.js";
import { createValidationError } from "./validationErrors.js";
import {
  normalizeValidationSessionId,
  resolveValidationLogPath
} from "./validationPaths.js";
import {
  validationResultRecordSchema,
  type ListValidationResultsFilter,
  type RecordValidationResultInput,
  type ValidationResultRecord,
  type ValidationResultStore,
  type ValidationStoreOptions,
  type ValidationStoreResult
} from "./validationTypes.js";

export const hashValidationOutput = (output: string): string =>
  createHash("sha256").update(output).digest("hex");

const generateValidationResultId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `val_${safeTimestamp}_${suffix}`;
};

const readLines = async (filePath: string): Promise<string[] | Error> => {
  try {
    const content = await readFile(filePath, "utf8");

    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return [];
    }

    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseRecords = (lines: string[]): ValidationResultRecord[] =>
  lines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as unknown;
      const result = validationResultRecordSchema.safeParse(parsed);

      return result.success ? [result.data] : [];
    } catch {
      return [];
    }
  });

const matchesFilter = (
  record: ValidationResultRecord,
  filter: ListValidationResultsFilter | undefined
): boolean =>
  (filter?.kind === undefined || record.kind === filter.kind) &&
  (filter?.command === undefined || record.command === filter.command);

const resolveRepoRoot = async (
  cwd: string,
  explicitRepoRoot: string | undefined
): Promise<string | undefined> => {
  if (explicitRepoRoot !== undefined) {
    return explicitRepoRoot;
  }

  const gitState = await getGitState({ cwd });

  return gitState.isGitRepo ? gitState.repoRoot : undefined;
};

const createRecord = async (
  input: RecordValidationResultInput,
  options: Required<Pick<ValidationStoreOptions, "cwd" | "sessionId">> &
    Pick<ValidationStoreOptions, "repoRoot">
): Promise<ValidationResultRecord> => {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const completedAt = input.completedAt ?? startedAt;
  const durationMs =
    input.durationMs ??
    Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
  const repoRoot = await resolveRepoRoot(options.cwd, options.repoRoot);

  return validationResultRecordSchema.parse({
    id: generateValidationResultId(completedAt),
    sessionId: options.sessionId,
    ...(repoRoot !== undefined ? { repoRoot } : {}),
    cwd: options.cwd,
    kind: input.kind,
    command: input.command,
    status: input.status,
    exitCode: input.exitCode,
    startedAt,
    completedAt,
    durationMs,
    ...(input.outputSummary !== undefined
      ? { outputSummary: input.outputSummary }
      : {}),
    ...(input.outputHash !== undefined ? { outputHash: input.outputHash } : {}),
    ...(input.changedFilesHash !== undefined
      ? { changedFilesHash: input.changedFilesHash }
      : {}),
    ...(input.policyVersion !== undefined
      ? { policyVersion: input.policyVersion }
      : {}),
    source: input.source ?? "unknown"
  });
};

export const createValidationResultStore = (
  options: ValidationStoreOptions = {}
): ValidationResultStore => {
  const storeOptions = {
    ...options,
    cwd: path.resolve(options.cwd ?? process.cwd()),
    sessionId: normalizeValidationSessionId(options.sessionId)
  };

  const listValidationResults = async (
    filter?: ListValidationResultsFilter
  ): Promise<ValidationStoreResult<ValidationResultRecord[]>> => {
    const validationPath = resolveValidationLogPath(storeOptions);
    const lines = await readLines(validationPath);

    if (lines instanceof Error) {
      return {
        ok: false,
        error: createValidationError(
          "VALIDATION_READ_ERROR",
          `Validation result log could not be read: ${validationPath}`,
          { path: validationPath, details: lines }
        )
      };
    }

    return {
      ok: true,
      path: validationPath,
      value: parseRecords(lines).filter((record) =>
        matchesFilter(record, filter)
      )
    };
  };

  const getLatestValidationResult = async (
    filter?: ListValidationResultsFilter
  ): Promise<ValidationStoreResult<ValidationResultRecord | null>> => {
    const listed = await listValidationResults(filter);

    if (!listed.ok) {
      return listed;
    }

    return {
      ok: true,
      ...(listed.path !== undefined ? { path: listed.path } : {}),
      value: listed.value.at(-1) ?? null
    };
  };

  const recordValidationResult = async (
    input: RecordValidationResultInput
  ): Promise<ValidationStoreResult<ValidationResultRecord>> => {
    const validationPath = resolveValidationLogPath(storeOptions);

    let record: ValidationResultRecord;

    try {
      record = await createRecord(input, storeOptions);
    } catch (error) {
      return {
        ok: false,
        error: createValidationError(
          "VALIDATION_RECORD_INVALID",
          "Validation result record could not be created.",
          { details: error instanceof ZodError ? error.issues : error }
        )
      };
    }

    try {
      await mkdir(path.dirname(validationPath), { recursive: true });
      await appendFile(validationPath, `${JSON.stringify(record)}\n`, "utf8");

      return {
        ok: true,
        path: validationPath,
        value: record
      };
    } catch (error) {
      return {
        ok: false,
        error: createValidationError(
          "VALIDATION_WRITE_ERROR",
          `Validation result could not be written: ${validationPath}`,
          { path: validationPath, details: error }
        )
      };
    }
  };

  return {
    recordValidationResult,
    listValidationResults,
    getLatestValidationResult
  };
};
