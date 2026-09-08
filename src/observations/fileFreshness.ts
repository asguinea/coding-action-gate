import { stat } from "node:fs/promises";
import { computeFileHash } from "./fileHash.js";
import type {
  FileFreshnessResult,
  ObservationStoreOptions
} from "./fileObservationTypes.js";
import { createFileObservationStore } from "./fileObservationStore.js";
import { resolveObservedFilePath } from "./observationPaths.js";

export interface CheckFileFreshnessInput extends ObservationStoreOptions {
  path: string;
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

export const checkFileFreshness = async (
  input: CheckFileFreshnessInput
): Promise<FileFreshnessResult> => {
  const cwd = input.cwd ?? process.cwd();
  const observedPath = resolveObservedFilePath(input.path, cwd);
  const store = createFileObservationStore(input);
  const latest = await store.getLatestObservation(input.path);

  if (!latest.ok) {
    return {
      status: "unknown",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      reason: latest.error.message
    };
  }

  if (latest.record === null) {
    return {
      status: "unknown",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      reason: "No file observation exists for this path."
    };
  }

  const currentExists = await fileExists(observedPath.absolutePath);

  if (!latest.record.exists) {
    return {
      status: currentExists ? "stale" : "missing",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      lastObservation: latest.record,
      reason: currentExists
        ? "File exists now, but the latest observation recorded it as missing."
        : "File is still missing."
    };
  }

  if (!currentExists) {
    return {
      status: "missing",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      lastObservation: latest.record,
      reason: "File is missing after the latest observation."
    };
  }

  if (latest.record.metadataOnly === true) {
    return {
      status: "unknown",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      lastObservation: latest.record,
      reason: "Latest observation is metadata-only."
    };
  }

  const hashResult = await computeFileHash(observedPath.absolutePath);

  if (!hashResult.ok) {
    return {
      status: "unknown",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      lastObservation: latest.record,
      reason: hashResult.error.message
    };
  }

  if (hashResult.hash === latest.record.contentHash) {
    return {
      status: "fresh",
      path: input.path,
      absolutePath: observedPath.absolutePath,
      lastObservation: latest.record,
      currentHash: hashResult.hash,
      currentSizeBytes: hashResult.sizeBytes,
      reason: "Current file hash matches the latest observation."
    };
  }

  return {
    status: "stale",
    path: input.path,
    absolutePath: observedPath.absolutePath,
    lastObservation: latest.record,
    currentHash: hashResult.hash,
    currentSizeBytes: hashResult.sizeBytes,
    reason: "Current file hash differs from the latest observation."
  };
};
