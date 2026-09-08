import { createHash } from "node:crypto";
import { checkFileFreshness } from "../observations/fileFreshness.js";
import type {
  DeferredActionRecord,
  DeferredEvidenceEvaluation,
  DeferredEvidenceRequirement,
  DeferredEvidenceRequirementType,
  DeferredEvidenceSatisfaction
} from "./deferredActionTypes.js";
import { stableCanonicalJson } from "./actionFingerprint.js";

const requirementId = (
  type: DeferredEvidenceRequirementType,
  target: string | undefined,
  reason: string | undefined
): string => {
  const hash = createHash("sha256")
    .update(stableCanonicalJson({ type, target, reason }))
    .digest("hex")
    .slice(0, 16);

  return `req_${hash}`;
};

const makeRequirement = (input: {
  type: DeferredEvidenceRequirementType;
  target?: string;
  reason?: string;
  required?: boolean;
}): DeferredEvidenceRequirement => ({
  id: requirementId(input.type, input.target, input.reason),
  type: input.type,
  ...(input.target !== undefined ? { target: input.target } : {}),
  ...(input.reason !== undefined ? { reason: input.reason } : {}),
  required: input.required ?? true,
  satisfied: false
});

const mergeRequirement = (
  requirements: Map<string, DeferredEvidenceRequirement>,
  requirement: DeferredEvidenceRequirement
): void => {
  const key = `${requirement.type}:${requirement.target ?? ""}`;
  const existing = requirements.get(key);

  if (existing === undefined) {
    requirements.set(key, requirement);
    return;
  }

  requirements.set(key, {
    ...existing,
    required: existing.required || requirement.required,
    reason: existing.reason ?? requirement.reason
  });
};

export const deriveRequiredEvidence = (
  input: Pick<DeferredActionRecord, "missingContext" | "fetchPlan">
): DeferredEvidenceRequirement[] => {
  const requirements = new Map<string, DeferredEvidenceRequirement>();

  for (const entry of input.missingContext) {
    if (
      entry.type === "current_file_contents" ||
      entry.type === "full_file_observation" ||
      entry.type === "file_existence" ||
      entry.type === "related_tests"
    ) {
      mergeRequirement(
        requirements,
        makeRequirement({
          type: "file_observation",
          ...(entry.target !== undefined ? { target: entry.target } : {}),
          ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
          required: entry.required
        })
      );
      continue;
    }

    if (entry.type === "validation_result") {
      mergeRequirement(
        requirements,
        makeRequirement({
          type: "validation_result",
          ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
          required: entry.required
        })
      );
      continue;
    }

    mergeRequirement(
      requirements,
      makeRequirement({
        type: "other",
        ...(entry.target !== undefined ? { target: entry.target } : {}),
        ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
        required: entry.required
      })
    );
  }

  for (const step of input.fetchPlan) {
    if (step.type === "read_file" || step.type === "read_related_tests") {
      mergeRequirement(
        requirements,
        makeRequirement({
          type: "file_observation",
          ...(step.target !== undefined ? { target: step.target } : {}),
          ...(step.reason !== undefined ? { reason: step.reason } : {})
        })
      );
      continue;
    }

    if (step.type === "run_validation") {
      mergeRequirement(
        requirements,
        makeRequirement({
          type: "validation_result",
          ...(step.reason !== undefined ? { reason: step.reason } : {})
        })
      );
    }
  }

  return Array.from(requirements.values());
};

const satisfactionForFileObservation = async (
  record: DeferredActionRecord,
  requirement: DeferredEvidenceRequirement,
  options: {
    cwd?: string;
    observationDir?: string;
  }
): Promise<DeferredEvidenceSatisfaction | undefined> => {
  if (requirement.target === undefined) {
    return undefined;
  }

  const freshness = await checkFileFreshness({
    path: requirement.target,
    sessionId: record.sessionId,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.observationDir !== undefined
      ? { observationDir: options.observationDir }
      : {})
  });

  if (freshness.status !== "fresh") {
    return undefined;
  }

  return {
    requirementId: requirement.id,
    satisfiedAt: new Date().toISOString(),
    evidenceType: "file_observation",
    evidenceRef: requirement.target,
    details: {
      targetFileFreshness: freshness.status,
      ...(freshness.currentHash !== undefined
        ? { currentFileHash: freshness.currentHash }
        : {})
    }
  };
};

export const evaluateDeferredEvidence = async (
  record: DeferredActionRecord,
  options: {
    cwd?: string;
    observationDir?: string;
  } = {}
): Promise<DeferredEvidenceEvaluation> => {
  const satisfactions: DeferredEvidenceSatisfaction[] = [];
  const requirements: DeferredEvidenceRequirement[] = [];

  for (const requirement of record.requiredEvidence) {
    const satisfaction =
      requirement.type === "file_observation"
        ? await satisfactionForFileObservation(record, requirement, options)
        : undefined;
    const satisfied = satisfaction !== undefined || requirement.satisfied;

    requirements.push({
      ...requirement,
      satisfied
    });

    if (satisfaction !== undefined) {
      satisfactions.push(satisfaction);
    }
  }

  return {
    allRequiredSatisfied: requirements.every(
      (requirement) => !requirement.required || requirement.satisfied
    ),
    requirements,
    satisfactions
  };
};
