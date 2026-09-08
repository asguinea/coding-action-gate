import { isAnalyticsEnabled } from "./analyticsConfig.js";
import { readAnalyticsEventLog } from "./analyticsStore.js";
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  DecisionCreatedPayload,
  RetryCompletedPayload,
  UncertaintyProfileCreatedPayload,
  UncertaintyReductionPlanCreatedPayload,
  UncertaintyRouterRecommendationCreatedPayload
} from "./analyticsTypes.js";
import type { DecisionPosture } from "../domain/decisions.js";

export const analyticsStorageRelativePath =
  ".coding-action-gate/analytics/events.jsonl";

const eventTypeOrder = [
  "decision_created",
  "defer_recorded",
  "retry_completed",
  "uncertainty_profile_created",
  "uncertainty_reduction_plan_created",
  "uncertainty_router_recommendation_created",
  "ui_launched",
  "doctor_run",
  "init_run",
  "export_feedback_run",
  "unknown"
] as const;

const decisionOrder = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK",
  "UNKNOWN"
] as const;

const actionTypeOrder = [
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "run_command",
  "install_dependency",
  "run_tests",
  "git",
  "deploy",
  "unknown"
] as const;

const retryOutcomeOrder = [
  "resolved",
  "still_deferred",
  "escalated",
  "blocked",
  "failed",
  "unknown"
] as const;

const commandUsageOrder = [
  "doctor_run",
  "init_run",
  "export_feedback_run",
  "ui_launched"
] as const;

const uncertaintyLevelOrder = [
  "low",
  "medium",
  "high",
  "critical",
  "unknown"
] as const;

type KnownEventType = (typeof eventTypeOrder)[number];
type SummaryDecision = (typeof decisionOrder)[number];
type SummaryActionType = (typeof actionTypeOrder)[number];
type SummaryRetryOutcome = (typeof retryOutcomeOrder)[number];
type CommandUsageType = (typeof commandUsageOrder)[number];
type SummaryUncertaintyLevel = (typeof uncertaintyLevelOrder)[number];

export interface UncertaintyAnalyticsSummary {
  uncertaintyProfileCount: number;
  uncertaintyReductionPlanCount: number;
  uncertaintyRouterRecommendationCount: number;
  byOverallLevel: Record<SummaryUncertaintyLevel, number>;
  byTopDriver: Record<string, number>;
  byDimensionLevel: Record<string, Record<SummaryUncertaintyLevel, number>>;
  routerRecommendations: Record<SummaryDecision, number>;
  reductionStepKinds: Record<string, number>;
}

export interface AnalyticsSummary {
  status: {
    localAnalytics: "enabled" | "disabled";
    disabledReason: "environment" | "none";
    storage: typeof analyticsStorageRelativePath;
    events: number;
    firstEventTimestamp?: string;
    lastEventTimestamp?: string;
    eventFileExists: boolean;
    skippedMalformedEvents: number;
  };
  eventCounts: Record<KnownEventType, number>;
  decisionDistribution: Record<SummaryDecision, number>;
  actionTypeDistribution: Record<SummaryActionType, number>;
  deferResolution: Record<SummaryRetryOutcome, number>;
  retryFinalDecisionDistribution: Record<SummaryDecision, number>;
  commandUsage: Record<CommandUsageType, number>;
  uncertainty: UncertaintyAnalyticsSummary;
}

const countRecord = <TKey extends string>(
  keys: readonly TKey[]
): Record<TKey, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<TKey, number>;

const isKnownEventType = (value: unknown): value is AnalyticsEventType =>
  typeof value === "string" &&
  eventTypeOrder.includes(value as KnownEventType) &&
  value !== "unknown";

const safeDecision = (value: unknown): SummaryDecision =>
  decisionOrder.includes(value as SummaryDecision)
    ? (value as SummaryDecision)
    : "UNKNOWN";

const safeActionType = (value: unknown): SummaryActionType =>
  actionTypeOrder.includes(value as SummaryActionType)
    ? (value as SummaryActionType)
    : "unknown";

const safeRetryOutcome = (value: unknown): SummaryRetryOutcome =>
  retryOutcomeOrder.includes(value as SummaryRetryOutcome)
    ? (value as SummaryRetryOutcome)
    : "unknown";

const safeUncertaintyLevel = (value: unknown): SummaryUncertaintyLevel =>
  uncertaintyLevelOrder.includes(value as SummaryUncertaintyLevel)
    ? (value as SummaryUncertaintyLevel)
    : "unknown";

const categoryIdPattern = /^[a-z][a-z0-9_]*$/;

const safeCategoryId = (value: unknown): string | undefined =>
  typeof value === "string" && categoryIdPattern.test(value)
    ? value
    : undefined;

const incrementDynamic = (
  record: Record<string, number>,
  key: string
): void => {
  record[key] = (record[key] ?? 0) + 1;
};

const createEmptyUncertaintySummary = (): UncertaintyAnalyticsSummary => ({
  uncertaintyProfileCount: 0,
  uncertaintyReductionPlanCount: 0,
  uncertaintyRouterRecommendationCount: 0,
  byOverallLevel: countRecord(uncertaintyLevelOrder),
  byTopDriver: {},
  byDimensionLevel: {},
  routerRecommendations: countRecord(decisionOrder),
  reductionStepKinds: {}
});

const incrementDimensionLevel = (
  summary: UncertaintyAnalyticsSummary,
  dimension: string,
  level: SummaryUncertaintyLevel
): void => {
  if (summary.byDimensionLevel[dimension] === undefined) {
    summary.byDimensionLevel[dimension] = countRecord(uncertaintyLevelOrder);
  }

  summary.byDimensionLevel[dimension][level] += 1;
};

const addTopDrivers = (
  summary: UncertaintyAnalyticsSummary,
  drivers: unknown
): void => {
  if (!Array.isArray(drivers)) {
    return;
  }

  for (const driver of drivers) {
    const safeDriver = safeCategoryId(driver);

    if (safeDriver !== undefined) {
      incrementDynamic(summary.byTopDriver, safeDriver);
    }
  }
};

const addReductionStepKinds = (
  summary: UncertaintyAnalyticsSummary,
  stepKinds: unknown
): void => {
  if (!Array.isArray(stepKinds)) {
    return;
  }

  for (const stepKind of stepKinds) {
    const safeStepKind = safeCategoryId(stepKind);

    if (safeStepKind !== undefined) {
      incrementDynamic(summary.reductionStepKinds, safeStepKind);
    }
  }
};

const payloadFor = <TEventType extends AnalyticsEventType>(
  event: AnalyticsEvent,
  eventType: TEventType
): AnalyticsEvent<TEventType>["payload"] | undefined =>
  event.eventType === eventType
    ? (event.payload as AnalyticsEvent<TEventType>["payload"])
    : undefined;

const sortedTimestamps = (events: AnalyticsEvent[]): string[] =>
  events
    .map((event) => event.timestamp)
    .filter((timestamp) => typeof timestamp === "string")
    .sort();

export const buildAnalyticsSummary = async (
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<AnalyticsSummary> => {
  const readResult = await readAnalyticsEventLog({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {})
  });
  const timestamps = sortedTimestamps(readResult.events);
  const eventCounts = countRecord(eventTypeOrder);
  const decisionDistribution = countRecord(decisionOrder);
  const actionTypeDistribution = countRecord(actionTypeOrder);
  const deferResolution = countRecord(retryOutcomeOrder);
  const retryFinalDecisionDistribution = countRecord(decisionOrder);
  const commandUsage = countRecord(commandUsageOrder);
  const uncertainty = createEmptyUncertaintySummary();
  const firstEventTimestamp = timestamps[0];
  const lastEventTimestamp = timestamps[timestamps.length - 1];

  for (const event of readResult.events) {
    const eventType: KnownEventType = isKnownEventType(event.eventType)
      ? event.eventType
      : "unknown";
    eventCounts[eventType] += 1;

    if (commandUsageOrder.includes(eventType as CommandUsageType)) {
      commandUsage[eventType as CommandUsageType] += 1;
    }

    const decisionPayload = payloadFor(event, "decision_created");

    if (decisionPayload !== undefined) {
      const payload = decisionPayload as DecisionCreatedPayload;
      decisionDistribution[safeDecision(payload.decision)] += 1;
      actionTypeDistribution[safeActionType(payload.actionType)] += 1;
    }

    const retryPayload = payloadFor(event, "retry_completed");

    if (retryPayload !== undefined) {
      const payload = retryPayload as RetryCompletedPayload;
      deferResolution[safeRetryOutcome(payload.retryOutcome)] += 1;
      retryFinalDecisionDistribution[
        safeDecision(payload.retryDecision as DecisionPosture | "UNKNOWN")
      ] += 1;
    }

    const uncertaintyProfilePayload = payloadFor(
      event,
      "uncertainty_profile_created"
    );

    if (uncertaintyProfilePayload !== undefined) {
      const payload =
        uncertaintyProfilePayload as UncertaintyProfileCreatedPayload;
      uncertainty.uncertaintyProfileCount += 1;
      uncertainty.byOverallLevel[safeUncertaintyLevel(payload.overallLevel)] +=
        1;
      addTopDrivers(uncertainty, payload.topDrivers);

      for (const [dimension, level] of Object.entries(
        payload.dimensionLevels ?? {}
      )) {
        const safeDimension = safeCategoryId(dimension);

        if (safeDimension !== undefined) {
          incrementDimensionLevel(
            uncertainty,
            safeDimension,
            safeUncertaintyLevel(level)
          );
        }
      }
    }

    const uncertaintyReductionPlanPayload = payloadFor(
      event,
      "uncertainty_reduction_plan_created"
    );

    if (uncertaintyReductionPlanPayload !== undefined) {
      const payload =
        uncertaintyReductionPlanPayload as UncertaintyReductionPlanCreatedPayload;
      uncertainty.uncertaintyReductionPlanCount += 1;
      addTopDrivers(uncertainty, payload.topDrivers);
      addReductionStepKinds(uncertainty, payload.reductionStepKinds);
    }

    const uncertaintyRouterPayload = payloadFor(
      event,
      "uncertainty_router_recommendation_created"
    );

    if (uncertaintyRouterPayload !== undefined) {
      const payload =
        uncertaintyRouterPayload as UncertaintyRouterRecommendationCreatedPayload;
      uncertainty.uncertaintyRouterRecommendationCount += 1;
      uncertainty.routerRecommendations[
        safeDecision(payload.routerRecommendedDecision)
      ] += 1;
      addTopDrivers(uncertainty, payload.topDrivers);
    }
  }

  const enabled = isAnalyticsEnabled(options.env ?? process.env);

  return {
    status: {
      localAnalytics: enabled ? "enabled" : "disabled",
      disabledReason: enabled ? "none" : "environment",
      storage: analyticsStorageRelativePath,
      events: readResult.events.length,
      ...(firstEventTimestamp !== undefined ? { firstEventTimestamp } : {}),
      ...(lastEventTimestamp !== undefined ? { lastEventTimestamp } : {}),
      eventFileExists: readResult.fileExists,
      skippedMalformedEvents: readResult.malformedLineCount
    },
    eventCounts,
    decisionDistribution,
    actionTypeDistribution,
    deferResolution,
    retryFinalDecisionDistribution,
    commandUsage,
    uncertainty
  };
};

const formatCountSection = (
  title: string,
  entries: Array<[string, number]>,
  options: { includeZero?: boolean } = {}
): string[] => {
  const visibleEntries =
    options.includeZero === true
      ? entries
      : entries.filter(([, value]) => value > 0);

  if (visibleEntries.length === 0) {
    return [];
  }

  return [
    `${title}:`,
    ...visibleEntries.map(([key, value]) => `- ${key}: ${value}`)
  ];
};

const sortedDynamicEntries = (
  record: Record<string, number>
): Array<[string, number]> =>
  Object.entries(record).sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      rightValue - leftValue || leftKey.localeCompare(rightKey)
  );

export const formatAnalyticsSummary = (summary: AnalyticsSummary): string => {
  if (
    summary.status.events === 0 &&
    summary.status.skippedMalformedEvents === 0
  ) {
    return [
      "No local analytics events found.",
      "Run CodingActionGate commands in this workspace to generate local product-behavior analytics.",
      "",
      "Status:",
      `- Local analytics: ${summary.status.localAnalytics}`,
      `- Storage: ${summary.status.storage}`
    ].join("\n");
  }

  const lines = [
    "CodingActionGate Local Analytics Summary",
    "",
    "Status:",
    `- Local analytics: ${summary.status.localAnalytics}`,
    `- Storage: ${summary.status.storage}`,
    `- Events: ${summary.status.events}`,
    `- Range: ${
      summary.status.firstEventTimestamp ?? "none"
    } -> ${summary.status.lastEventTimestamp ?? "none"}`
  ];

  if (summary.status.skippedMalformedEvents > 0) {
    lines.push(
      `- Skipped malformed events: ${summary.status.skippedMalformedEvents}`
    );
  }

  const sections = [
    formatCountSection(
      "Decision distribution",
      decisionOrder
        .filter((decision) => decision !== "UNKNOWN")
        .map((decision) => [decision, summary.decisionDistribution[decision]])
    ),
    formatCountSection(
      "DEFER resolution",
      retryOutcomeOrder.map((outcome) => [
        outcome,
        summary.deferResolution[outcome]
      ])
    ),
    formatCountSection(
      "Retry final decisions",
      decisionOrder.map((decision) => [
        decision,
        summary.retryFinalDecisionDistribution[decision]
      ])
    ),
    formatCountSection(
      "Top event types",
      eventTypeOrder.map((eventType) => [
        eventType,
        summary.eventCounts[eventType]
      ])
    ),
    formatCountSection(
      "Command usage",
      commandUsageOrder.map((eventType) => [
        eventType,
        summary.commandUsage[eventType]
      ])
    ),
    formatCountSection(
      "Behavior signals",
      actionTypeOrder.map((actionType) => [
        `actionType ${actionType}`,
        summary.actionTypeDistribution[actionType]
      ])
    ),
    formatCountSection("Uncertainty events", [
      [
        "uncertainty_profile_created",
        summary.uncertainty.uncertaintyProfileCount
      ],
      [
        "uncertainty_reduction_plan_created",
        summary.uncertainty.uncertaintyReductionPlanCount
      ],
      [
        "uncertainty_router_recommendation_created",
        summary.uncertainty.uncertaintyRouterRecommendationCount
      ]
    ]),
    formatCountSection(
      "Uncertainty overall levels",
      uncertaintyLevelOrder.map((level) => [
        level,
        summary.uncertainty.byOverallLevel[level]
      ])
    ),
    formatCountSection(
      "Uncertainty router recommendations",
      decisionOrder.map((decision) => [
        decision,
        summary.uncertainty.routerRecommendations[decision]
      ])
    ),
    formatCountSection(
      "Uncertainty top drivers",
      sortedDynamicEntries(summary.uncertainty.byTopDriver)
    ),
    formatCountSection(
      "Uncertainty reduction step kinds",
      sortedDynamicEntries(summary.uncertainty.reductionStepKinds)
    )
  ].filter((section) => section.length > 0);

  for (const section of sections) {
    lines.push("", ...section);
  }

  return lines.join("\n");
};
