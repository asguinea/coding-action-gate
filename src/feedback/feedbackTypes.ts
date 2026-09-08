import type { DecisionPosture } from "../domain/decisions.js";
import type { DoctorResult } from "../doctor/doctorTypes.js";
import type { LoadedPolicySource } from "../policy/policyErrors.js";

export interface FeedbackExportOptions {
  cwd?: string;
  policy?: string;
  out?: string;
  sessionId?: string;
  auditDir?: string;
  deferDir?: string;
  observationDir?: string;
  validationDir?: string;
  limit?: number;
}

export interface FeedbackExportSummary {
  auditRecords: number;
  deferredActions: number;
  validationRecords: number;
}

export interface FeedbackExportResult {
  path: string;
  bundle: FeedbackBundle;
  summary: FeedbackExportSummary;
}

export interface FeedbackCommandOutput {
  ok: true;
  path: string;
  summary: FeedbackExportSummary;
  redacted: true;
}

export interface FeedbackPathSummary {
  basename: string;
  hash: string;
}

export interface FeedbackDecisionSummary {
  decisionId: string;
  timestamp: string;
  sessionId?: string;
  actionType: string;
  targetPaths: FeedbackPathSummary[];
  targetPathHashes: string[];
  commandSummary?: string;
  validationKind?: string;
  diffStats?: Record<string, unknown>;
  decision: DecisionPosture;
  reason: string;
  deferReasonCategory?: string;
  policyRuleIds: string[];
  detectorIds: string[];
  signalSummary: Record<string, unknown>;
}

export interface FeedbackDeferredSummary {
  id: string;
  decisionId?: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  actionType: string;
  targetPaths: FeedbackPathSummary[];
  commandSummary?: string;
  missingContextTypes: string[];
  fetchPlanTypes: string[];
  requiredEvidenceTypes: string[];
  requiredEvidenceCount: number;
  satisfiedEvidenceCount: number;
}

export interface FeedbackValidationSummary {
  id: string;
  sessionId: string;
  kind: string;
  commandSummary: string;
  status: string;
  exitCode: number;
  durationMs?: number;
  completedAt: string;
  outputHash?: string;
  policyVersion?: string;
  source: string;
}

export interface FeedbackPolicySummary {
  source: LoadedPolicySource;
  summary: {
    version?: string;
    protectedBranchCount: number;
    protectedBranches: string[];
    sensitivePathCounts: {
      critical: number;
      high: number;
      medium: number;
    };
    validation: {
      beforeCommitRequired: boolean;
      beforeCommitCommandCount: number;
      beforePushRequired: boolean;
      beforePushCommandCount: number;
    };
    thresholds: Record<string, unknown>;
    rules: Array<{
      id: string;
      decision: DecisionPosture;
      conditionKeys: string[];
    }>;
  };
}

export interface FeedbackBundle {
  schemaVersion: "0.1";
  generatedAt: string;
  cwdHash: string;
  sessionId: string;
  redacted: true;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    codingActionGateVersion: string;
  };
  doctor: Pick<DoctorResult, "ok" | "summary"> & {
    checks: Array<{
      id: string;
      status: string;
      message: string;
      remediation?: string;
    }>;
  };
  policy?: FeedbackPolicySummary;
  decisions: {
    counts: Record<DecisionPosture, number>;
    records: FeedbackDecisionSummary[];
  };
  deferred: {
    count: number;
    records: FeedbackDeferredSummary[];
  };
  observations: {
    count: number;
    metadataOnlyCount: number;
    fullObservationCount: number;
  };
  validation: {
    count: number;
    records: FeedbackValidationSummary[];
  };
  git: {
    isGitRepo: boolean;
    currentBranch?: string;
    isDetachedHead?: boolean;
    isDirty?: boolean;
    hasUncommittedChanges?: boolean;
    hasUntrackedFiles?: boolean;
    repoIntegrityStatus: string;
  };
  exportWarnings: string[];
}
