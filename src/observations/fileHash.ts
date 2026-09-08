import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
  createFileObservationError,
  type FileObservationError
} from "./observationErrors.js";
import type { FileHashResult } from "./fileObservationTypes.js";

const errorCodeFromReadError = (error: unknown): FileObservationError => {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;

  if (code === "ENOENT") {
    return createFileObservationError("FILE_NOT_FOUND", "File was not found.", {
      details: error
    });
  }

  return createFileObservationError(
    "FILE_READ_ERROR",
    "File could not be read.",
    { details: error }
  );
};

export const computeFileHash = async (
  filePath: string
): Promise<FileHashResult> => {
  try {
    const [content, fileStats] = await Promise.all([
      readFile(filePath),
      stat(filePath)
    ]);
    const hash = createHash("sha256").update(content).digest("hex");

    return {
      ok: true,
      hash,
      algorithm: "sha256",
      sizeBytes: fileStats.size
    };
  } catch (error) {
    const observationError = errorCodeFromReadError(error);

    return {
      ok: false,
      error: {
        ...observationError,
        path: filePath
      }
    };
  }
};
