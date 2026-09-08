import type { ActionType } from "../domain/actions.js";
import type { DecisionPosture } from "../domain/decisions.js";
import type { ExpectedNextDecision } from "../defer/deferTypes.js";

export const analyticsSchemaVersion = "0.1" as const;

export type AnalyticsEventType =
  | "decision_created"
  | "defer_recorded"
  | "retry_completed"
  | "uncertainty_profile_created"
  | "uncertainty_reduction_plan_created"
  | "uncertainty_router_recommendation_created"
  | "ui_launched"
  | "doctor_run"
  | "init_run"
  | "export_feedback_run";

export type AnalyticsEventSource = "cli" | "ui" | "runtime";

export type AnalyticsActionType =
  | ActionType
  | "install_dependency"
  | "run_tests"
  | "git"
  | "deploy"
  | "unknown";

export type AnalyticsRiskBucket =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

export interface DecisionCreatedPayload {
  decision: DecisionPosture;
  actionType: AnalyticsActionType;
  riskBucket: AnalyticsRiskBucket;
  detectorIds: string[];
  ruleIds: string[];
  hasDefer: boolean;
  hasEscalation: boolean;
  hasBlock: boolean;
}

export interface DeferRecordedPayload {
  deferReasonIds: string[];
  missingContextKinds: string[];
  fetchPlanStepKinds: string[];
  expectedNextDecision: ExpectedNextDecision;
  contextCompletenessBucket: "complete" | "partial" | "missing" | "unknown";
}

export type RetryOutcome =
  | "resolved"
  | "still_deferred"
  | "escalated"
  | "blocked"
  | "failed";

export interface RetryCompletedPayload {
  originalDecision: "DEFER";
  retryDecision: DecisionPosture | "UNKNOWN";
  retryOutcome: RetryOutcome;
  elapsedBucket: "under_1m" | "1m_5m" | "5m_30m" | "over_30m" | "unknown";
}

export type AnalyticsUncertaintyLevel = "low" | "medium" | "high" | "critical";

export type AnalyticsUncertaintyImpact = "low" | "medium" | "high" | "critical";

export type AnalyticsUncertaintyReducibility =
  | "reducible"
  | "partially_reducible"
  | "irreducible";

export type AnalyticsUncertaintyScoreBucket =
  | "zero"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface UncertaintyProfileCreatedPayload {
  schemaVersion: string;
  overallLevel: AnalyticsUncertaintyLevel;
  overallScoreBucket: AnalyticsUncertaintyScoreBucket;
  impact: AnalyticsUncertaintyImpact;
  reducibility: AnalyticsUncertaintyReducibility;
  dimensionsPresent: string[];
  topDrivers: string[];
  dimensionLevels: Record<string, AnalyticsUncertaintyLevel>;
  dimensionImpacts: Record<string, AnalyticsUncertaintyImpact>;
  dimensionReducibility: Record<string, AnalyticsUncertaintyReducibility>;
  reductionPlanAvailable: boolean;
  reductionStepCount: number;
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}

export interface UncertaintyReductionPlanCreatedPayload {
  schemaVersion: string;
  reductionStepKinds: string[];
  reductionStepCount: number;
  expectedNextDecision: DecisionPosture | "PROCEED_OR_ESCALATE" | "UNKNOWN";
  topDrivers: string[];
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}

export interface UncertaintyRouterRecommendationCreatedPayload {
  schemaVersion: string;
  routerRecommendedDecision: DecisionPosture;
  routerConfidence: "low" | "medium" | "high";
  routerRationale: string[];
  blockingDriverCount: number;
  deferDriverCount: number;
  escalationDriverCount: number;
  reductionPlanAvailable: boolean;
  topDrivers: string[];
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}

export interface UiLaunchedPayload {
  mode: "live" | "mock" | "unknown";
  localhostOnly: true;
  uiServerEnabled: boolean;
  bundledUiAssetsFound: boolean;
}

export interface DoctorRunPayload {
  result: "passed" | "warnings" | "failed" | "unknown";
  checkCounts: {
    pass: number;
    warn: number;
    fail: number;
    info: number;
  };
}

export interface InitRunPayload {
  result: "created" | "already_initialized" | "failed" | "unknown";
  template:
    | "basic"
    | "node"
    | "strict"
    | "monorepo-lite"
    | "custom"
    | "unknown";
}

export interface ExportFeedbackRunPayload {
  result: "created" | "failed" | "unknown";
  includedSections: string[];
}

export interface AnalyticsPayloadByType {
  decision_created: DecisionCreatedPayload;
  defer_recorded: DeferRecordedPayload;
  retry_completed: RetryCompletedPayload;
  uncertainty_profile_created: UncertaintyProfileCreatedPayload;
  uncertainty_reduction_plan_created: UncertaintyReductionPlanCreatedPayload;
  uncertainty_router_recommendation_created: UncertaintyRouterRecommendationCreatedPayload;
  ui_launched: UiLaunchedPayload;
  doctor_run: DoctorRunPayload;
  init_run: InitRunPayload;
  export_feedback_run: ExportFeedbackRunPayload;
}

export type AnalyticsPayload = AnalyticsPayloadByType[AnalyticsEventType];

export interface AnalyticsEvent<
  TEventType extends AnalyticsEventType = AnalyticsEventType
> {
  eventId: string;
  eventType: TEventType;
  timestamp: string;
  schemaVersion: typeof analyticsSchemaVersion;
  runId: string;
  source: AnalyticsEventSource;
  payload: AnalyticsPayloadByType[TEventType];
}

export interface RecordAnalyticsEventInput<
  TEventType extends AnalyticsEventType = AnalyticsEventType
> {
  cwd?: string;
  eventType: TEventType;
  source: AnalyticsEventSource;
  payload: AnalyticsPayloadByType[TEventType] | Record<string, unknown>;
  runId?: string;
}
