import type {
  FileFreshnessResult,
  FileFreshnessStatus,
  FileObservationRecord
} from "../observations/fileObservationTypes.js";

export interface ReadBeforeWriteTargetFreshness {
  path: string;
  absolutePath: string;
  status: FileFreshnessStatus;
  lastObservation?: FileObservationRecord;
  currentHash?: string;
  currentSizeBytes?: number;
  reason: string;
  secretSkipped?: boolean;
}

export type ReadBeforeWriteFreshnessInput =
  | FileFreshnessResult
  | ReadBeforeWriteTargetFreshness;
