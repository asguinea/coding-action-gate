import type { AuditRecord } from "../domain/audit.js";
import type { DeferredActionRecord } from "../defer/deferredActionTypes.js";
import type { FileObservationRecord } from "../observations/fileObservationTypes.js";
import type { ValidationResultRecord } from "../validation/validationTypes.js";
import type { GitState } from "../git/gitTypes.js";

export interface UiAdapterReadOptions {
  cwd?: string;
  limit?: number;
}

export interface ReadAuditRecordsOptions extends UiAdapterReadOptions {
  auditDir?: string;
}

export interface ReadDeferredActionsOptions extends UiAdapterReadOptions {
  deferDir?: string;
  sessionId?: string;
}

export interface ReadObservationsOptions extends UiAdapterReadOptions {
  observationDir?: string;
  sessionId?: string;
}

export interface ReadValidationRecordsOptions extends UiAdapterReadOptions {
  validationDir?: string;
  sessionId?: string;
}

export interface ReadGitStateSummaryOptions {
  cwd?: string;
}

export interface GitStateSummary {
  isGitRepo: boolean;
  repoRoot?: string;
  currentBranch?: string;
  isDetachedHead?: boolean;
  upstreamBranch?: string;
  upstreamRemote?: string;
  isDirty?: boolean;
  hasUncommittedChanges?: boolean;
  hasUntrackedFiles?: boolean;
  lastCommitHash?: string;
  repoIntegrityStatus: "clean" | "dirty" | "not_git_repo" | "unknown";
  error?: string;
  raw: GitState;
}

export type UiAuditRecord = AuditRecord;
export type UiDeferredActionRecord = DeferredActionRecord;
export type UiObservationRecord = FileObservationRecord;
export type UiValidationRecord = ValidationResultRecord;
