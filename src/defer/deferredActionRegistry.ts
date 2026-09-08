import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import type { StepHarborAction } from "../domain/actions.js";
import { redactObject } from "../redaction/redactObject.js";
import {
  actionCommandExecutableForDeferral,
  actionTargetPathsForDeferral,
  areActionsSimilarForDeferral,
  fingerprintAction
} from "./actionFingerprint.js";
import { createDeferredActionError } from "./deferredActionErrors.js";
import {
  normalizeDeferredActionSessionId,
  resolveDeferredActionLogPath
} from "./deferredActionPaths.js";
import {
  deriveRequiredEvidence,
  evaluateDeferredEvidence
} from "./deferredEvidence.js";
import {
  deferredActionRecordSchema,
  type DeferredActionRecord,
  type DeferredActionRegistry,
  type DeferredActionRegistryOptions,
  type DeferredActionResult,
  type DeferredBypassResult,
  type DeferredEvidenceRequirement,
  type DeferredEvidenceSatisfaction,
  type DetectDeferredBypassInput,
  type ListDeferredActionFilter,
  type RecordDeferredActionInput,
  type RecordDeferredDecisionInput,
  type RecordDeferredDecisionResult
} from "./deferredActionTypes.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const generateDeferredActionId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `def_${safeTimestamp}_${suffix}`;
};

const readLines = async (filePath: string): Promise<string[] | Error> => {
  try {
    const content = await readFile(filePath, "utf8");

    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return [];
    }

    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseRecords = (lines: string[]): DeferredActionRecord[] =>
  lines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as unknown;
      const result = deferredActionRecordSchema.safeParse(parsed);

      return result.success ? [result.data] : [];
    } catch {
      return [];
    }
  });

const latestRecords = (
  records: DeferredActionRecord[]
): DeferredActionRecord[] =>
  Array.from(
    records
      .reduce<
        Map<string, DeferredActionRecord>
      >((byId, record) => byId.set(record.id, record), new Map())
      .values()
  ).sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const appendRecord = async (
  record: DeferredActionRecord,
  filePath: string
): Promise<DeferredActionResult<DeferredActionRecord>> => {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");

    return {
      ok: true,
      path: filePath,
      value: record
    };
  } catch (error) {
    return {
      ok: false,
      error: createDeferredActionError(
        "DEFERRED_ACTION_WRITE_ERROR",
        `Deferred action record could not be written: ${filePath}`,
        { path: filePath, details: error }
      )
    };
  }
};

const readLatestRecords = async (
  filePath: string
): Promise<DeferredActionResult<DeferredActionRecord[]>> => {
  const lines = await readLines(filePath);

  if (lines instanceof Error) {
    return {
      ok: false,
      error: createDeferredActionError(
        "DEFERRED_ACTION_READ_ERROR",
        `Deferred action registry could not be read: ${filePath}`,
        { path: filePath, details: lines }
      )
    };
  }

  return {
    ok: true,
    path: filePath,
    value: latestRecords(parseRecords(lines))
  };
};

const matchesFilter = (
  record: DeferredActionRecord,
  filter: ListDeferredActionFilter | undefined
): boolean => {
  if (filter?.status === undefined) {
    return true;
  }

  return Array.isArray(filter.status)
    ? filter.status.includes(record.status)
    : record.status === filter.status;
};

const commandForAction = (
  action: StepHarborAction | NormalizedStepHarborAction
): string | undefined => {
  if (
    "normalized" in action &&
    isRecord(action.normalized) &&
    typeof action.normalized["command"] === "string"
  ) {
    return action.normalized["command"];
  }

  return "command" in action && typeof action.command === "string"
    ? action.command.trim()
    : undefined;
};

const actionTypeForAction = (
  action: StepHarborAction | NormalizedStepHarborAction
): string =>
  "normalized" in action &&
  isRecord(action.normalized) &&
  typeof action.normalized["actionType"] === "string"
    ? action.normalized["actionType"]
    : action.type;

const recordIsSimilarToAction = (
  record: DeferredActionRecord,
  action: StepHarborAction | NormalizedStepHarborAction
): boolean => {
  if (record.actionFingerprint === fingerprintAction(action)) {
    return true;
  }

  if (
    isRecord(record.originalAction) &&
    "type" in record.originalAction &&
    typeof record.originalAction["type"] === "string" &&
    areActionsSimilarForDeferral(
      record.originalAction as StepHarborAction,
      action
    )
  ) {
    return true;
  }

  if (record.actionSummary.actionType === actionTypeForAction(action)) {
    const recordTargets = new Set([
      ...(record.actionSummary.normalizedRelativeTargetPaths ?? []),
      ...(record.actionSummary.targetPaths ?? [])
    ]);

    if (
      actionTargetPathsForDeferral(action).some((target) =>
        recordTargets.has(target)
      )
    ) {
      return true;
    }
  }

  const actionCommand = commandForAction(action);
  const actionExecutable = actionCommandExecutableForDeferral(action);

  return (
    record.actionSummary.command !== undefined &&
    actionCommand !== undefined &&
    record.actionSummary.command === actionCommand &&
    actionExecutable !== undefined
  );
};

const collectNormalizedRelativeTargetPaths = (
  action: NormalizedStepHarborAction
): string[] | undefined => {
  const paths = [
    ...(action.normalized.relativeTargetPath !== undefined
      ? [action.normalized.relativeTargetPath]
      : []),
    ...(action.normalized.relativeTargetPaths ?? [])
  ];
  const unique = Array.from(new Set(paths));

  return unique.length > 0 ? unique : undefined;
};

const createRecordFromDeferredDecision = (
  input: RecordDeferredDecisionInput
): DeferredActionRecord => {
  const createdAt = new Date().toISOString();
  const sessionId = normalizeDeferredActionSessionId(input.sessionId);
  const missingContext = input.decision.missingContext ?? [];
  const fetchPlan = input.decision.fetchPlan ?? [];
  const actionSummary = {
    actionType: input.action.normalized.actionType,
    ...(actionTargetPathsForDeferral(input.action).length > 0
      ? { targetPaths: actionTargetPathsForDeferral(input.action) }
      : {}),
    ...(commandForAction(input.action) !== undefined
      ? { command: commandForAction(input.action) }
      : {}),
    ...(collectNormalizedRelativeTargetPaths(input.action) !== undefined
      ? {
          normalizedRelativeTargetPaths: collectNormalizedRelativeTargetPaths(
            input.action
          )
        }
      : {})
  };
  const recordInput = {
    id: generateDeferredActionId(createdAt),
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    sessionId,
    createdAt,
    updatedAt: createdAt,
    status: "pending",
    actionFingerprint: fingerprintAction(input.action),
    actionSummary,
    originalAction: redactObject(input.action).value,
    decision: input.decision,
    missingContext,
    fetchPlan,
    requiredEvidence: deriveRequiredEvidence({ missingContext, fetchPlan }),
    policyTrace: input.decision.matchedPolicies
  };

  return deferredActionRecordSchema.parse(recordInput);
};

const updateRequirementsWithSatisfactions = (
  requirements: DeferredEvidenceRequirement[],
  satisfactions: DeferredEvidenceSatisfaction[]
): DeferredEvidenceRequirement[] => {
  const satisfiedIds = new Set(
    satisfactions.map((satisfaction) => satisfaction.requirementId)
  );

  return requirements.map((requirement) => ({
    ...requirement,
    satisfied: requirement.satisfied || satisfiedIds.has(requirement.id)
  }));
};

export const createDeferredActionRegistry = (
  options: DeferredActionRegistryOptions = {}
): DeferredActionRegistry => {
  const registryOptions = {
    ...options,
    sessionId: normalizeDeferredActionSessionId(options.sessionId)
  };
  const filePath = resolveDeferredActionLogPath(registryOptions);

  const listDeferredActions = async (
    filter?: ListDeferredActionFilter
  ): Promise<DeferredActionResult<DeferredActionRecord[]>> => {
    const listed = await readLatestRecords(filePath);

    if (!listed.ok) {
      return listed;
    }

    return {
      ok: true,
      path: filePath,
      value: listed.value.filter((record) => matchesFilter(record, filter))
    };
  };

  const getDeferredAction = async (
    id: string
  ): Promise<DeferredActionResult<DeferredActionRecord | null>> => {
    const listed = await listDeferredActions();

    if (!listed.ok) {
      return listed;
    }

    return {
      ok: true,
      path: filePath,
      value: listed.value.find((record) => record.id === id) ?? null
    };
  };

  const recordDeferredAction = async (
    input: RecordDeferredActionInput
  ): Promise<DeferredActionResult<DeferredActionRecord>> => {
    let record: DeferredActionRecord;

    try {
      record = deferredActionRecordSchema.parse(input.record);
    } catch (error) {
      return {
        ok: false,
        error: createDeferredActionError(
          "DEFERRED_ACTION_VALIDATION_ERROR",
          "Deferred action record failed schema validation.",
          {
            path: filePath,
            details: error instanceof ZodError ? error.issues : error
          }
        )
      };
    }

    return appendRecord(record, filePath);
  };

  const findPendingSimilarAction = async (
    action: StepHarborAction | NormalizedStepHarborAction
  ): Promise<DeferredActionResult<DeferredActionRecord | null>> => {
    const listed = await listDeferredActions({ status: "pending" });

    if (!listed.ok) {
      return listed;
    }

    return {
      ok: true,
      path: filePath,
      value:
        listed.value.find((record) =>
          recordIsSimilarToAction(record, action)
        ) ?? null
    };
  };

  const markDeferredActionSatisfied = async (
    id: string,
    satisfaction: DeferredEvidenceSatisfaction | DeferredEvidenceSatisfaction[]
  ): Promise<DeferredActionResult<DeferredActionRecord | null>> => {
    const existing = await getDeferredAction(id);

    if (!existing.ok || existing.value === null) {
      return existing;
    }

    const satisfactions = Array.isArray(satisfaction)
      ? satisfaction
      : [satisfaction];
    const updated = deferredActionRecordSchema.parse({
      ...existing.value,
      status: "satisfied",
      updatedAt: new Date().toISOString(),
      requiredEvidence: updateRequirementsWithSatisfactions(
        existing.value.requiredEvidence,
        satisfactions
      ),
      satisfiedEvidence: [
        ...(existing.value.satisfiedEvidence ?? []),
        ...satisfactions
      ]
    });

    return appendRecord(updated, filePath);
  };

  const markDeferredActionSuperseded = async (
    id: string
  ): Promise<DeferredActionResult<DeferredActionRecord | null>> => {
    const existing = await getDeferredAction(id);

    if (!existing.ok || existing.value === null) {
      return existing;
    }

    const updated = deferredActionRecordSchema.parse({
      ...existing.value,
      status: "superseded",
      updatedAt: new Date().toISOString()
    });

    return appendRecord(updated, filePath);
  };

  return {
    recordDeferredAction,
    listDeferredActions,
    getDeferredAction,
    findPendingSimilarAction,
    markDeferredActionSatisfied,
    markDeferredActionSuperseded
  };
};

export const recordDeferredDecision = async (
  input: RecordDeferredDecisionInput
): Promise<RecordDeferredDecisionResult> => {
  if (input.decision.decision !== "DEFER") {
    return {
      ok: true,
      value: {
        recorded: false
      }
    };
  }

  let record: DeferredActionRecord;

  try {
    record = createRecordFromDeferredDecision(input);
  } catch (error) {
    return {
      ok: false,
      error: createDeferredActionError(
        "DEFERRED_ACTION_VALIDATION_ERROR",
        "Deferred action record could not be created.",
        {
          details: error instanceof ZodError ? error.issues : error
        }
      )
    };
  }

  const registry = createDeferredActionRegistry({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.deferDir !== undefined ? { deferDir: input.deferDir } : {}),
    sessionId: record.sessionId
  });
  const recorded = await registry.recordDeferredAction({ record });

  if (!recorded.ok) {
    return recorded;
  }

  return {
    ok: true,
    ...(recorded.path !== undefined ? { path: recorded.path } : {}),
    value: {
      recorded: true,
      record: recorded.value
    }
  };
};

const unsatisfiedRequirements = (
  evaluation: Awaited<ReturnType<typeof evaluateDeferredEvidence>>
): DeferredEvidenceRequirement[] =>
  evaluation.requirements.filter(
    (requirement) => requirement.required && !requirement.satisfied
  );

export const detectDeferredBypass = async (
  input: DetectDeferredBypassInput
): Promise<DeferredActionResult<DeferredBypassResult>> => {
  const similar = await input.registry.findPendingSimilarAction(input.action);

  if (!similar.ok) {
    return similar;
  }

  if (similar.value === null) {
    return {
      ok: true,
      value: {
        possibleBypass: false
      }
    };
  }

  const evaluation = await evaluateDeferredEvidence(similar.value, {
    ...(input.context?.cwd !== undefined ? { cwd: input.context.cwd } : {}),
    ...(input.context?.observationDir !== undefined
      ? { observationDir: input.context.observationDir }
      : {})
  });
  const unsatisfied = unsatisfiedRequirements(evaluation);

  if (unsatisfied.length === 0) {
    return {
      ok: true,
      value: {
        possibleBypass: false,
        matchingDeferredAction: similar.value
      }
    };
  }

  return {
    ok: true,
    value: {
      possibleBypass: true,
      matchingDeferredAction: similar.value,
      reason:
        "A similar deferred action is still waiting on required evidence.",
      unsatisfiedRequirements: unsatisfied
    }
  };
};
