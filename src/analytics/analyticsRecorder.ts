import { randomUUID } from "node:crypto";

import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import type { SafetySignalDetectorResult } from "../signals/detectors/index.js";
import type { DecisionOutput, DecisionPosture } from "../domain/decisions.js";
import type { DoctorResult } from "../doctor/doctorTypes.js";
import type {
  DeferredActionRecord,
  DeferredEvidenceRequirement
} from "../defer/deferredActionTypes.js";
import { isAnalyticsEnabled } from "./analyticsConfig.js";
import { appendAnalyticsEvent } from "./analyticsStore.js";
import { sanitizeAnalyticsEventPayload } from "./analyticsSanitizer.js";
import {
  analyticsSchemaVersion,
  type AnalyticsActionType,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type AnalyticsPayloadByType,
  type AnalyticsRiskBucket,
  type RecordAnalyticsEventInput,
  type RetryOutcome
} from "./analyticsTypes.js";

export const recordAnalyticsEvent = async <
  TEventType extends AnalyticsEventType
>(
  input: RecordAnalyticsEventInput<TEventType>
): Promise<void> => {
  if (!isAnalyticsEnabled()) {
    return;
  }

  try {
    const event: AnalyticsEvent<TEventType> = {
      eventId: randomUUID(),
      eventType: input.eventType,
      timestamp: new Date().toISOString(),
      schemaVersion: analyticsSchemaVersion,
      runId: input.runId ?? randomUUID(),
      source: input.source,
      payload: sanitizeAnalyticsEventPayload(
        input.eventType,
        input.payload
      ) as AnalyticsPayloadByType[TEventType]
    };

    await appendAnalyticsEvent(event as AnalyticsEvent, {
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {})
    });
  } catch {
    // Analytics must never affect StepHarbor command behavior.
  }
};

const analyticsActionType = (
  action: NormalizedStepHarborAction
): AnalyticsActionType => {
  if (action.normalized.isGitLikeCommand === true) {
    return "git";
  }

  if (action.normalized.isValidationLikeCommand === true) {
    return "run_tests";
  }

  return action.normalized.actionType;
};

const unique = (values: string[]): string[] =>
  Array.from(new Set(values)).sort();

const ruleIdsForDecision = (decision: DecisionOutput): string[] =>
  unique(decision.matchedPolicies.map((policy) => policy.ruleId));

const detectorIdsForResults = (
  detectorResults: SafetySignalDetectorResult[] = []
): string[] => unique(detectorResults.map((result) => result.detectorId));

const riskBucketForDecision = (
  decision: DecisionOutput
): AnalyticsRiskBucket => {
  if (decision.decision === "BLOCK") {
    return "critical";
  }

  if (decision.decision === "ESCALATE") {
    return "high";
  }

  if (decision.decision === "DEFER") {
    return "medium";
  }

  return "low";
};

export const recordDecisionCreated = async (input: {
  cwd?: string;
  action: NormalizedStepHarborAction;
  decision: DecisionOutput;
  detectorResults?: SafetySignalDetectorResult[];
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "decision_created",
    source: "runtime",
    payload: {
      decision: input.decision.decision,
      actionType: analyticsActionType(input.action),
      riskBucket: riskBucketForDecision(input.decision),
      detectorIds: detectorIdsForResults(input.detectorResults),
      ruleIds: ruleIdsForDecision(input.decision),
      hasDefer: input.decision.decision === "DEFER",
      hasEscalation: input.decision.decision === "ESCALATE",
      hasBlock: input.decision.decision === "BLOCK"
    }
  });

const contextCompletenessBucket = (
  record: DeferredActionRecord
): "complete" | "partial" | "missing" | "unknown" => {
  if (record.missingContext.length === 0) {
    return "complete";
  }

  if (record.missingContext.some((entry) => entry.required)) {
    return "missing";
  }

  return "partial";
};

export const recordDeferRecorded = async (input: {
  cwd?: string;
  record: DeferredActionRecord;
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "defer_recorded",
    source: "runtime",
    payload: {
      deferReasonIds:
        input.record.decision.deferReasonCategory !== undefined
          ? [input.record.decision.deferReasonCategory]
          : ["unknown_defer_reason"],
      missingContextKinds: unique(
        input.record.missingContext.map((entry) => entry.type)
      ),
      fetchPlanStepKinds: unique(
        input.record.fetchPlan.map((step) => step.type)
      ),
      expectedNextDecision:
        input.record.decision.expectedNextDecision ?? "UNKNOWN",
      contextCompletenessBucket: contextCompletenessBucket(input.record)
    }
  });

const retryOutcomeForDecision = (
  decision: DecisionPosture | "UNKNOWN",
  failed = false
): RetryOutcome => {
  if (failed || decision === "UNKNOWN") {
    return "failed";
  }

  if (decision === "PROCEED") {
    return "resolved";
  }

  if (decision === "DEFER") {
    return "still_deferred";
  }

  if (decision === "ESCALATE") {
    return "escalated";
  }

  return "blocked";
};

export const recordRetryCompleted = async (input: {
  cwd?: string;
  retryDecision?: DecisionPosture;
  failed?: boolean;
}): Promise<void> => {
  const retryDecision = input.retryDecision ?? "UNKNOWN";

  await recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "retry_completed",
    source: "runtime",
    payload: {
      originalDecision: "DEFER",
      retryDecision,
      retryOutcome: retryOutcomeForDecision(
        retryDecision,
        input.failed === true
      ),
      elapsedBucket: "unknown"
    }
  });
};

export const recordUiLaunched = async (input: {
  cwd?: string;
  mode: "live" | "mock" | "unknown";
  uiServerEnabled: boolean;
  bundledUiAssetsFound: boolean;
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "ui_launched",
    source: "ui",
    payload: {
      mode: input.mode,
      localhostOnly: true,
      uiServerEnabled: input.uiServerEnabled,
      bundledUiAssetsFound: input.bundledUiAssetsFound
    }
  });

export const recordDoctorRun = async (input: {
  cwd?: string;
  result: DoctorResult;
}): Promise<void> => {
  const status = !input.result.ok
    ? "failed"
    : input.result.summary.warn > 0
      ? "warnings"
      : "passed";

  await recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "doctor_run",
    source: "cli",
    payload: {
      result: status,
      checkCounts: input.result.summary
    }
  });
};

export const recordInitRun = async (input: {
  cwd?: string;
  result: "created" | "already_initialized" | "failed" | "unknown";
  template?: string;
}): Promise<void> => {
  const knownTemplates = ["basic", "node", "strict", "monorepo-lite"];
  const template =
    input.template === undefined
      ? "unknown"
      : knownTemplates.includes(input.template)
        ? input.template
        : "custom";

  await recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "init_run",
    source: "cli",
    payload: {
      result: input.result,
      template: template as AnalyticsPayloadByType["init_run"]["template"]
    }
  });
};

export const recordExportFeedbackRun = async (input: {
  cwd?: string;
  result: "created" | "failed" | "unknown";
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "export_feedback_run",
    source: "cli",
    payload: {
      result: input.result,
      includedSections: [
        "audit_summary",
        "deferred_summary",
        "policy",
        "diagnostics",
        "validation_summary",
        "git_summary"
      ]
    }
  });

export const retryFailurePayloadFromRequirements = (
  requirements: DeferredEvidenceRequirement[]
): string[] => unique(requirements.map((requirement) => requirement.type));
