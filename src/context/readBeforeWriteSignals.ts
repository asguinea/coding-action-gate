import type { StepHarborSignals } from "../domain/signals.js";
import type {
  FileFreshnessStatus,
  FileObservationRecord
} from "../observations/fileObservationTypes.js";
import type { ReadBeforeWriteFreshnessInput } from "./readBeforeWriteTypes.js";

const freshnessRank: Record<FileFreshnessStatus, number> = {
  fresh: 0,
  unknown: 1,
  missing: 2,
  stale: 3
};

const normalizeUnknownReason = (reason: string): string =>
  reason === "No file observation exists for this path."
    ? "Target file has not been observed in this session."
    : reason;

const latestObservedAt = (
  observation: FileObservationRecord | undefined
): string | undefined => observation?.observedAt;

const latestHash = (
  observation: FileObservationRecord | undefined
): string | undefined => {
  if (
    observation === undefined ||
    observation.metadataOnly === true ||
    observation.contentHash === "metadata-only" ||
    observation.contentHash === "missing"
  ) {
    return undefined;
  }

  return observation.contentHash;
};

const fileChangedSinceRead = (
  result: ReadBeforeWriteFreshnessInput
): boolean | undefined => {
  if (result.status === "fresh") {
    return false;
  }

  if (result.status === "stale") {
    return true;
  }

  if (result.status === "missing") {
    return result.lastObservation?.exists === true ? true : undefined;
  }

  return undefined;
};

const strongestFreshnessResult = (
  results: ReadBeforeWriteFreshnessInput[]
): ReadBeforeWriteFreshnessInput =>
  results.reduce((strongest, candidate) =>
    freshnessRank[candidate.status] > freshnessRank[strongest.status]
      ? candidate
      : strongest
  );

export const buildReadBeforeWriteSignals = (
  results: ReadBeforeWriteFreshnessInput[]
): StepHarborSignals => {
  if (results.length === 0) {
    return {};
  }

  const strongest = strongestFreshnessResult(results);
  const allFresh = results.every((result) => result.status === "fresh");
  const changedSignal = results
    .map((result) => fileChangedSinceRead(result))
    .some((changed) => changed === true)
    ? true
    : allFresh
      ? false
      : undefined;
  const observedAt = latestObservedAt(strongest.lastObservation);
  const observedHash = latestHash(strongest.lastObservation);

  return {
    targetFileReadRecently: allFresh,
    targetFileFreshness: strongest.status,
    ...(changedSignal !== undefined
      ? { fileChangedSinceRead: changedSignal }
      : {}),
    ...(observedAt !== undefined ? { lastReadTimestamp: observedAt } : {}),
    ...(observedHash !== undefined ? { lastReadHash: observedHash } : {}),
    ...(strongest.currentHash !== undefined
      ? { currentFileHash: strongest.currentHash }
      : {}),
    readBeforeWriteReason: allFresh
      ? "All mutation targets are fresh."
      : normalizeUnknownReason(strongest.reason)
  };
};
