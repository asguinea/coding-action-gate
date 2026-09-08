import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { computeFileHash } from "./fileHash.js";
import {
  fileObservationRecordSchema,
  type FileObservationRecord,
  type FileObservationRecordResult,
  type LatestFileObservationResult,
  type ListFileObservationsResult,
  type ObservationStoreOptions,
  type RecordFileObservationInput
} from "./fileObservationTypes.js";
import {
  normalizeObservationSessionId,
  resolveObservationLogPath,
  resolveObservedFilePath
} from "./observationPaths.js";
import {
  createFileObservationError,
  type FileObservationError
} from "./observationErrors.js";

const generateObservationId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `obs_${safeTimestamp}_${suffix}`;
};

const isFileObservationError = (
  value: unknown
): value is FileObservationError =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  "message" in value;

const fileStatsIfExists = async (
  filePath: string
): Promise<{ exists: true; sizeBytes: number } | { exists: false }> => {
  try {
    const fileStats = await stat(filePath);

    return {
      exists: true,
      sizeBytes: fileStats.size
    };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return {
        exists: false
      };
    }

    throw error;
  }
};

const readObservationLines = async (
  filePath: string
): Promise<string[] | Error> => {
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

const parseObservationLines = (lines: string[]): FileObservationRecord[] =>
  lines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as unknown;
      const result = fileObservationRecordSchema.safeParse(parsed);

      return result.success ? [result.data] : [];
    } catch {
      return [];
    }
  });

const createRecord = async (
  input: RecordFileObservationInput,
  storeOptions: ObservationStoreOptions
): Promise<FileObservationRecord> => {
  const cwd = input.cwd ?? storeOptions.cwd ?? process.cwd();
  const sessionId = normalizeObservationSessionId(
    input.sessionId ?? storeOptions.sessionId
  );
  const observedPath = resolveObservedFilePath(input.path, cwd);
  const observedAt = new Date().toISOString();
  const metadataOnly = input.metadataOnly === true;
  const fileStats = await fileStatsIfExists(observedPath.absolutePath);

  if (metadataOnly) {
    return fileObservationRecordSchema.parse({
      id: generateObservationId(observedAt),
      sessionId,
      path: input.path,
      absolutePath: observedPath.absolutePath,
      relativePath: observedPath.relativePath,
      observedAt,
      contentHash: fileStats.exists ? "metadata-only" : "missing",
      hashAlgorithm: "sha256",
      sizeBytes: fileStats.exists ? fileStats.sizeBytes : 0,
      exists: fileStats.exists,
      source: input.source ?? "unknown",
      metadataOnly: true
    });
  }

  if (!fileStats.exists) {
    return fileObservationRecordSchema.parse({
      id: generateObservationId(observedAt),
      sessionId,
      path: input.path,
      absolutePath: observedPath.absolutePath,
      relativePath: observedPath.relativePath,
      observedAt,
      contentHash: "missing",
      hashAlgorithm: "sha256",
      sizeBytes: 0,
      exists: false,
      source: input.source ?? "unknown"
    });
  }

  const hashResult = await computeFileHash(observedPath.absolutePath);

  if (!hashResult.ok) {
    throw hashResult.error;
  }

  return fileObservationRecordSchema.parse({
    id: generateObservationId(observedAt),
    sessionId,
    path: input.path,
    absolutePath: observedPath.absolutePath,
    relativePath: observedPath.relativePath,
    observedAt,
    contentHash: hashResult.hash,
    hashAlgorithm: hashResult.algorithm,
    sizeBytes: hashResult.sizeBytes,
    exists: true,
    source: input.source ?? "unknown"
  });
};

export const createFileObservationStore = (
  options: ObservationStoreOptions = {}
) => {
  const storeOptions = {
    ...options,
    sessionId: normalizeObservationSessionId(options.sessionId)
  };

  const listObservations = async (): Promise<ListFileObservationsResult> => {
    const observationPath = resolveObservationLogPath(storeOptions);
    const lines = await readObservationLines(observationPath);

    if (lines instanceof Error) {
      return {
        ok: false,
        error: createFileObservationError(
          "OBSERVATION_READ_ERROR",
          `Observation log could not be read: ${observationPath}`,
          { path: observationPath, details: lines }
        )
      };
    }

    return {
      ok: true,
      records: parseObservationLines(lines)
    };
  };

  const getLatestObservation = async (
    filePath: string
  ): Promise<LatestFileObservationResult> => {
    const cwd = storeOptions.cwd ?? process.cwd();
    const observedPath = resolveObservedFilePath(filePath, cwd);
    const listed = await listObservations();

    if (!listed.ok) {
      return listed;
    }

    const record =
      listed.records
        .filter(
          (candidate) => candidate.absolutePath === observedPath.absolutePath
        )
        .at(-1) ?? null;

    return {
      ok: true,
      record
    };
  };

  const recordObservation = async (
    input: RecordFileObservationInput
  ): Promise<FileObservationRecordResult> => {
    const observationPath = resolveObservationLogPath({
      ...storeOptions,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {})
    });
    const observationDir = path.dirname(observationPath);

    let record: FileObservationRecord;

    try {
      record = await createRecord(input, storeOptions);
    } catch (error) {
      if (isFileObservationError(error)) {
        return {
          ok: false,
          error
        };
      }

      return {
        ok: false,
        error: createFileObservationError(
          "OBSERVATION_VALIDATION_ERROR",
          "File observation record could not be created.",
          {
            path: input.path,
            details: error instanceof ZodError ? error.issues : error
          }
        )
      };
    }

    try {
      await mkdir(observationDir, { recursive: true });
      await appendFile(observationPath, `${JSON.stringify(record)}\n`, "utf8");

      return {
        ok: true,
        path: observationPath,
        record
      };
    } catch (error) {
      return {
        ok: false,
        error: createFileObservationError(
          "OBSERVATION_WRITE_ERROR",
          `Observation record could not be written: ${observationPath}`,
          { path: observationPath, details: error }
        )
      };
    }
  };

  return {
    recordObservation,
    getLatestObservation,
    listObservations
  };
};

export const recordFileObservation = (
  input: RecordFileObservationInput
): Promise<FileObservationRecordResult> =>
  createFileObservationStore(input).recordObservation(input);
