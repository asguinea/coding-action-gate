import { describe, expect, it } from "vitest";
import {
  buildUncertaintyReductionPlan,
  expectedNextDecisionForReductionPlan
} from "../../src/uncertainty/uncertaintyReductionPlan.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import {
  createDefaultUncertaintyDimensions,
  uncertaintyReductionPlanSchema,
  uncertaintyReductionPlanSchemaVersion,
  type UncertaintyDimensionsRecord,
  type UncertaintyDimension
} from "../../src/uncertainty/uncertaintyTypes.js";

const withDrivers = (
  entries: Array<{
    dimension: UncertaintyDimension;
    drivers: string[];
    score?: number;
  }>
): UncertaintyDimensionsRecord => {
  const dimensions = createDefaultUncertaintyDimensions();

  for (const entry of entries) {
    dimensions[entry.dimension] = {
      ...dimensions[entry.dimension],
      score: entry.score ?? 0.7,
      level: "high",
      drivers: entry.drivers
    };
  }

  return dimensions;
};

const stepKinds = (profile: ReturnType<typeof buildUncertaintyProfile>) =>
  profile.uncertaintyReductionPlan?.steps.map((step) => step.kind) ?? [];

describe("uncertainty reduction plans", () => {
  it("uses a stable reduction plan schema version", () => {
    expect(uncertaintyReductionPlanSchemaVersion).toBe(
      "uncertainty-reduction-plan.v1"
    );
  });

  it("does not create a plan for low/default profiles", () => {
    const profile = buildUncertaintyProfile();

    expect(profile.uncertaintyReductionPlan).toBeUndefined();
  });

  it("creates context and freshness steps for target file drivers", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: false,
        targetFileFreshness: "stale",
        fileChangedSinceRead: true
      }
    });

    expect(stepKinds(profile)).toEqual(
      expect.arrayContaining(["read_target_file", "refresh_target_file"])
    );
    expect(profile.uncertaintyReductionPlan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "read_target_file",
          reduces: expect.arrayContaining(["context", "freshness"]),
          driversAddressed: expect.arrayContaining([
            "target_file_not_observed"
          ]),
          requiredEvidence: expect.arrayContaining([
            "target_file_observed",
            "target_file_hash_available"
          ])
        }),
        expect.objectContaining({
          kind: "refresh_target_file",
          driversAddressed: expect.arrayContaining([
            "target_file_stale",
            "target_file_hash_changed"
          ])
        })
      ])
    );
  });

  it("deduplicates equivalent target file read steps deterministically", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: false,
        targetFileFreshness: "unknown"
      }
    });
    const readSteps =
      profile.uncertaintyReductionPlan?.steps.filter(
        (step) => step.kind === "read_target_file"
      ) ?? [];

    expect(readSteps).toHaveLength(1);
    expect(readSteps[0]?.driversAddressed).toEqual([
      "target_file_freshness_unknown",
      "target_file_not_observed"
    ]);
    expect(readSteps[0]?.requiredEvidence).toEqual([
      "target_file_hash_available",
      "target_file_observed"
    ]);
  });

  it("creates related context and test steps", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        relatedTestsFound: true,
        relatedTestsRead: false,
        contextCompletenessScore: 0.2
      }
    });

    expect(stepKinds(profile)).toEqual(
      expect.arrayContaining(["read_related_tests", "inspect_related_context"])
    );
  });

  it("creates validation steps without treating failed validation as rerun-only", () => {
    const missing = buildUncertaintyProfile({
      signals: {
        validationRequired: true,
        validationStatus: "not_run"
      }
    });
    const unclear = buildUncertaintyProfile({
      signals: {
        validationStatus: "unknown",
        validationScope: "unknown"
      }
    });
    const failed = buildUncertaintyProfile({
      signals: {
        validationRequired: true,
        validationStatus: "failed"
      }
    });

    expect(stepKinds(missing)).toContain("run_validation");
    expect(stepKinds(unclear)).toContain("inspect_validation_config");
    expect(stepKinds(failed)).toEqual(
      expect.arrayContaining([
        "inspect_validation_failure",
        "fix_validation_failure_before_retry"
      ])
    );
    expect(stepKinds(failed)).not.toContain("run_validation");
  });

  it("creates command classification steps and keeps critical commands cautious", () => {
    const unknown = buildUncertaintyProfile({
      signals: {
        commandRiskScore: "unknown"
      }
    });
    const packageLike = buildUncertaintyProfile({
      signals: {
        commandRiskScore: "medium",
        commandCategory: "local_write",
        networkExposure: true
      }
    });
    const critical = buildUncertaintyProfile({
      signals: {
        commandRiskScore: "critical"
      }
    });

    expect(stepKinds(unknown)).toContain("classify_command");
    expect(stepKinds(packageLike)).toContain("inspect_package_script");
    expect(stepKinds(critical)).toContain("stop_and_request_human_review");
    expect(critical.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("maps sensitive paths to context steps and secrets to human review", () => {
    const sensitive = buildUncertaintyProfile({
      signals: {
        pathSensitivity: "high"
      }
    });
    const secret = buildUncertaintyProfile({
      signals: {
        secretPathMatch: true,
        secretPatternMatch: true,
        secretTouch: "confirmed"
      }
    });

    expect(stepKinds(sensitive)).toEqual(
      expect.arrayContaining(["inspect_related_context", "read_related_tests"])
    );
    expect(stepKinds(secret)).toContain("stop_and_request_human_review");
    expect(secret.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("maps workspace boundary uncertainty and violations cautiously", () => {
    const unknown = buildUncertaintyProfile({
      signals: {
        workspaceBoundaryStatus: "unknown"
      }
    });
    const violation = buildUncertaintyProfile({
      signals: {
        workspaceBoundaryViolation: true
      }
    });

    expect(stepKinds(unknown)).toContain("inspect_workspace_boundary");
    expect(stepKinds(violation)).toContain("stop_and_request_human_review");
    expect(violation.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("maps git workflow risks and hard git flags", () => {
    const protectedBranch = buildUncertaintyProfile({
      signals: {
        protectedBranch: true,
        directMainlinePush: true,
        landingAction: true,
        landingRisk: "high"
      }
    });
    const forcePush = buildUncertaintyProfile({
      signals: {
        forcePush: true,
        hookBypass: true
      }
    });

    expect(stepKinds(protectedBranch)).toEqual(
      expect.arrayContaining([
        "inspect_git_state",
        "inspect_branch_policy",
        "run_validation"
      ])
    );
    expect(stepKinds(forcePush)).toContain("stop_and_request_human_review");
    expect(forcePush.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("maps environment and deployment drivers", () => {
    const ambiguous = buildUncertaintyProfile({
      signals: {
        landingAction: true,
        landingActionType: "deploy",
        environmentClassification: "unknown",
        deploymentRisk: "high"
      }
    });
    const production = buildUncertaintyProfile({
      signals: {
        environmentClassification: "production"
      }
    });

    expect(stepKinds(ambiguous)).toEqual(
      expect.arrayContaining(["inspect_environment", "confirm_deploy_target"])
    );
    expect(stepKinds(production)).toContain("stop_and_request_human_review");
    expect(production.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("maps recovery, autonomy, and provenance drivers", () => {
    const recovery = buildUncertaintyProfile({
      signals: {
        destructiveOperation: true
      }
    });
    const retryBudget = buildUncertaintyReductionPlan(
      withDrivers([
        {
          dimension: "autonomy_budget",
          drivers: ["retry_budget_exceeded"]
        }
      ])
    );
    const provenance = buildUncertaintyProfile({
      signals: {
        delegationProvenance: "unknown"
      }
    });

    expect(stepKinds(recovery)).toEqual(
      expect.arrayContaining(["inspect_recovery_state", "create_checkpoint"])
    );
    expect(retryBudget?.steps.map((step) => step.kind)).toContain(
      "stop_and_request_human_review"
    );
    expect(retryBudget?.expectedNextDecision).toBe("UNKNOWN");
    expect(stepKinds(provenance)).toContain("inspect_provenance");
  });

  it("orders steps deterministically with critical review first", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        workspaceBoundaryViolation: true,
        targetFileReadRecently: false,
        validationRequired: true,
        validationStatus: "not_run",
        commandRiskScore: "unknown"
      }
    });
    const firstKinds = profile.uncertaintyReductionPlan?.steps.map(
      (step) => step.kind
    );
    const second = buildUncertaintyProfile({
      signals: {
        workspaceBoundaryViolation: true,
        targetFileReadRecently: false,
        validationRequired: true,
        validationStatus: "not_run",
        commandRiskScore: "unknown"
      }
    });

    expect(firstKinds?.[0]).toBe("stop_and_request_human_review");
    expect(second.uncertaintyReductionPlan?.steps).toEqual(
      profile.uncertaintyReductionPlan?.steps
    );
  });

  it("uses conservative advisory expected next decisions", () => {
    const reducible = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: false,
        validationRequired: true,
        validationStatus: "not_run"
      }
    });
    const review = buildUncertaintyProfile({
      signals: {
        workspaceBoundaryViolation: true
      }
    });

    expect(reducible.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "PROCEED_OR_ESCALATE"
    );
    expect(review.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
    expect(
      expectedNextDecisionForReductionPlan(
        uncertaintyReductionPlanSchema.parse(review.uncertaintyReductionPlan)
          .steps
      )
    ).toBe("ESCALATE");
  });

  it("parses generated plans with the public schema", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: false
      }
    });

    expect(
      uncertaintyReductionPlanSchema.parse(profile.uncertaintyReductionPlan)
    ).toEqual(profile.uncertaintyReductionPlan);
  });
});
