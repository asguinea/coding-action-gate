export type UiDecisionPosture = "PROCEED" | "DEFER" | "ESCALATE" | "BLOCK";

export interface UiPolicyTraceEntry {
  ruleId: string;
  matched: boolean;
  effect?:
    | UiDecisionPosture
    | "PENDING_AFTER_DEFER"
    | "PENDING_RECHECK_AFTER_DEFER";
  reason?: string;
}

export interface UiMissingContextEntry {
  type: string;
  target?: string;
  reason?: string;
  required: boolean;
}

export interface UiFetchPlanStep {
  type: string;
  target?: string;
  query?: string;
  command?: string;
  validationKind?: string;
  safe: boolean;
  reason?: string;
}

export type UiSignalSummary = Record<string, unknown>;

export interface UiDetectorEvidence {
  detectorId?: string;
  ok?: boolean;
  signals?: UiSignalSummary;
  error?: unknown;
}

export interface UiAction {
  id: string;
  type: string;
  targetPath?: string;
  targetPaths?: string[];
  command?: string;
  validationKind?: string;
}

export interface UiAuditRecord {
  decisionId: string;
  timestamp: string;
  sessionId?: string;
  action: UiAction;
  targetPaths?: string[];
  decision: UiDecisionPosture;
  reason: string;
  signals?: UiSignalSummary;
  policyTrace?: UiPolicyTraceEntry[];
  evidence?: {
    signalSummary?: UiSignalSummary;
    detectorResults?: UiDetectorEvidence[];
    deferredActionId?: string;
    deferredAction?: {
      id?: string;
      recorded?: boolean;
    };
    [key: string]: unknown;
  };
  deferReasonCategory?: string;
  missingContext?: UiMissingContextEntry[];
  fetchPlan?: UiFetchPlanStep[];
  riskIfProceeding?: string[];
  expectedNextDecision?: UiDecisionPosture | "UNKNOWN";
  reanalysisRequired?: boolean;
  validationStatus?: string;
}

export interface UiKeySignal {
  key: string;
  label: string;
  value: string;
}

export interface UiActionSummary {
  actionType: string;
  label: string;
  targetPaths: string[];
  command?: string;
  validationKind?: string;
}

export interface UiDeferSummary {
  deferReasonCategory?: string;
  missingContextCount: number;
  fetchPlanCount: number;
  expectedNextDecision?: string;
  reanalysisRequired?: boolean;
}

export interface UiSuggestedCommand {
  label: string;
  command: string;
}

export interface UiEscalationRiskEntry {
  label: string;
  value: string;
  severity: "low" | "medium" | "high" | "critical" | "unknown";
  detail?: string;
}

export interface UiAffectedResources {
  targetPaths: string[];
  command?: string;
  currentBranch?: string;
  remoteTarget?: string;
}

export interface UiEscalationValidationStatus {
  present: boolean;
  required?: boolean;
  status?: string;
  latestCommand?: string;
  latestExitCode?: string;
}

export interface UiCountSummary {
  label: string;
  count: number;
  detail: string;
}

export interface UiGitStateSummary {
  isGitRepo: boolean;
  branch: string;
  repoIntegrityStatus: "clean" | "dirty" | "not_git_repo" | "unknown";
}

export interface PlaceholderDashboardData {
  auditRecords: UiAuditRecord[];
  validationRecordItems: UiValidationRecord[];
  selectedDecisionId: string;
  source: "mock" | "live";
  latestAuditRecord?: UiAuditRecord | null;
  deferredActionItems?: unknown[];
  observationItems?: unknown[];
  liveGitState?: unknown;
  policy?: UiPolicy;
  policySource?: UiPolicySource;
  deferredActions: UiCountSummary;
  validationRecords: UiCountSummary;
  observations: UiCountSummary;
  gitState: UiGitStateSummary;
  auditTimeline: UiCountSummary;
}

export interface UiAuditTimelineFilters {
  decision?: UiDecisionPosture | "all";
  actionType?: string | "all";
  search?: string;
}

export interface UiAuditTimelineSummary {
  decisionId: string;
  decision: UiDecisionPosture;
  timestamp: string;
  actionSummary: string;
  reason: string;
  matchedPolicyIds: string[];
  detectorIds: string[];
  sessionId?: string;
}

export interface UiStatusRow {
  label: string;
  value: string;
  severity?: "low" | "medium" | "high" | "critical" | "neutral" | "unknown";
}

export interface UiValidationRecord {
  id?: string;
  kind?: string;
  command?: string;
  status?: "passed" | "failed" | string;
  exitCode?: number;
  completedAt?: string;
}

export interface UiPolicySource {
  type: "explicit" | "discovered" | "default" | string;
  path?: string;
  version?: string;
}

export interface UiValidationPolicy {
  required?: boolean;
  commands?: string[];
  allowStaleResults?: boolean;
  maxAgeMinutes?: number;
}

export interface UiPolicyRule {
  id: string;
  decision: UiDecisionPosture;
  when?: Record<string, unknown>;
  reason?: string;
}

export interface UiPolicy {
  version?: string;
  protectedBranches?: string[];
  sensitivePaths?: {
    critical?: string[];
    high?: string[];
    medium?: string[];
  };
  validation?: {
    beforeCommit?: UiValidationPolicy;
    beforePush?: UiValidationPolicy;
  };
  thresholds?: Record<string, unknown>;
  rules?: UiPolicyRule[];
}

export interface UiPolicyRuleSummary {
  id: string;
  decision: string;
  condition: string;
  reason?: string;
}
