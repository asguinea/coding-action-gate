import { describe, expect, it } from "vitest";
import type { StepHarborSignals } from "../../src/domain/signals.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { uncertaintyDimensions } from "../../src/uncertainty/uncertaintyTypes.js";

const profileFor = (signals: StepHarborSignals) =>
  buildUncertaintyProfile({ signals });

describe("uncertainty signal mapping", () => {
  it("keeps every supported dimension present and default-low without signals", () => {
    const profile = buildUncertaintyProfile();

    expect(Object.keys(profile.dimensions).sort()).toEqual(
      [...uncertaintyDimensions].sort()
    );

    for (const dimension of uncertaintyDimensions) {
      expect(profile.dimensions[dimension]).toMatchObject({
        dimension,
        score: 0,
        level: "low",
        impact: "low",
        reducibility: "reducible",
        drivers: [],
        evidence: [],
        missingEvidence: []
      });
    }
  });

  it("maps context completeness bands to stable context drivers", () => {
    const low = profileFor({ contextCompletenessScore: 0.2 });
    const medium = profileFor({ contextCompletenessScore: 0.6 });
    const complete = profileFor({ contextCompletenessScore: 0.9 });

    expect(low.dimensions.context.drivers).toContain(
      "context_completeness_low"
    );
    expect(low.dimensions.context.level).toBe("high");
    expect(medium.dimensions.context.drivers).toContain(
      "context_completeness_medium"
    );
    expect(medium.dimensions.context.level).toBe("medium");
    expect(complete.dimensions.context.evidence).toContain(
      "related_context_observed"
    );
  });

  it("maps freshness hash changes and unknown freshness", () => {
    const stale = profileFor({
      targetFileFreshness: "stale",
      fileChangedSinceRead: true,
      lastReadHash: "hash_a",
      currentFileHash: "hash_b"
    });
    const unknown = profileFor({ targetFileFreshness: "unknown" });

    expect(stale.dimensions.freshness.drivers).toEqual(
      expect.arrayContaining(["target_file_stale", "target_file_hash_changed"])
    );
    expect(stale.dimensions.freshness.evidence).toContain(
      "target_file_hash_available"
    );
    expect(unknown.dimensions.freshness.drivers).toContain(
      "target_file_freshness_unknown"
    );
    expect(unknown.dimensions.freshness.missingEvidence).toContain(
      "target_file_hash_missing"
    );
  });

  it("maps validation failed, stale, missing, and unclear targets", () => {
    const failed = profileFor({
      validationRequired: true,
      validationStatus: "failed"
    });
    const stale = profileFor({
      validationRequired: true,
      validationStatus: "stale"
    });
    const missing = profileFor({
      validationRequired: true,
      validationStatus: "not_run"
    });
    const unclear = profileFor({
      validationStatus: "unknown",
      validationScope: "unknown"
    });

    expect(failed.dimensions.validation.drivers).toContain("validation_failed");
    expect(failed.dimensions.validation.level).toBe("critical");
    expect(failed.dimensions.validation.evidence).toContain(
      "validation_result_failed"
    );
    expect(stale.dimensions.validation.drivers).toContain("validation_stale");
    expect(missing.dimensions.validation.drivers).toContain(
      "validation_missing"
    );
    expect(unclear.dimensions.validation.drivers).toContain(
      "validation_target_unclear"
    );
  });

  it("maps command classification states", () => {
    const critical = profileFor({ commandRiskScore: "critical" });
    const high = profileFor({ commandRiskScore: "high" });
    const unknown = profileFor({ commandRiskScore: "unknown" });
    const packageLike = profileFor({
      commandRiskScore: "medium",
      commandCategory: "local_write",
      networkExposure: true
    });

    expect(critical.dimensions.command.drivers).toContain(
      "command_risk_critical"
    );
    expect(high.dimensions.command.drivers).toContain("command_risk_high");
    expect(unknown.dimensions.command.drivers).toContain(
      "command_classification_unknown"
    );
    expect(unknown.dimensions.command.level).toBe("medium");
    expect(packageLike.dimensions.command.drivers).toContain(
      "package_script_unknown"
    );
  });

  it("maps sensitivity and secret signal families", () => {
    const profile = profileFor({
      pathSensitivity: "high",
      secretPathMatch: true,
      secretPatternMatch: true,
      entropyAnomaly: true,
      secretTouch: "probable"
    });

    expect(profile.dimensions.sensitivity.drivers).toEqual(
      expect.arrayContaining([
        "sensitive_path_detected",
        "sensitive_surface_detected",
        "secret_path_detected",
        "secret_pattern_detected",
        "secret_material_detected"
      ])
    );
    expect(profile.dimensions.sensitivity.impact).toBe("critical");
  });

  it("maps workspace boundary safe, unknown, and violation states", () => {
    const safe = profileFor({ workspaceBoundaryStatus: "inside" });
    const unknown = profileFor({ workspaceBoundaryStatus: "unknown" });
    const violation = profileFor({ workspaceBoundaryViolation: true });

    expect(safe.dimensions.workspace_boundary.evidence).toContain(
      "workspace_boundary_checked"
    );
    expect(unknown.dimensions.workspace_boundary.drivers).toContain(
      "workspace_boundary_unknown"
    );
    expect(violation.dimensions.workspace_boundary.drivers).toContain(
      "workspace_boundary_violation"
    );
    expect(violation.dimensions.workspace_boundary.level).toBe("critical");
  });

  it("maps git workflow and landing signals", () => {
    const profile = profileFor({
      forcePush: true,
      hookBypass: true,
      directMainlineCommit: true,
      protectedBranch: true,
      isDirtyWorktree: true,
      landingAction: true,
      landingRisk: "high"
    });

    expect(profile.dimensions.git_workflow.drivers).toEqual(
      expect.arrayContaining([
        "force_push_detected",
        "hook_bypass_detected",
        "protected_branch_risk",
        "direct_mainline_risk",
        "dirty_worktree_detected",
        "landing_action_detected"
      ])
    );
  });

  it("maps deploy, release, publish, and environment signals", () => {
    const deploy = profileFor({
      landingAction: true,
      landingActionType: "deploy",
      deploymentRisk: "high",
      environmentClassification: "unknown"
    });
    const production = profileFor({ environmentClassification: "production" });
    const release = profileFor({
      landingActionType: "release",
      releaseRisk: "high"
    });
    const publish = profileFor({
      landingActionType: "publish",
      releaseRisk: "critical"
    });

    expect(deploy.dimensions.environment.drivers).toEqual(
      expect.arrayContaining([
        "environment_unknown",
        "deploy_target_ambiguous",
        "landing_action_detected"
      ])
    );
    expect(production.dimensions.environment.drivers).toContain(
      "production_environment_detected"
    );
    expect(release.dimensions.environment.drivers).toContain(
      "release_surface_detected"
    );
    expect(publish.dimensions.environment.drivers).toContain(
      "publish_surface_detected"
    );
  });

  it("maps recovery, autonomy budget, and provenance where signals exist", () => {
    const profile = profileFor({
      destructiveOperation: true,
      autonomyBudgetStatus: "unknown",
      delegationProvenance: "untrusted"
    });

    expect(profile.dimensions.recovery.drivers).toEqual(
      expect.arrayContaining([
        "recovery_state_unknown",
        "destructive_operation_recovery_unknown"
      ])
    );
    expect(profile.dimensions.autonomy_budget.drivers).toContain(
      "autonomy_budget_unknown"
    );
    expect(profile.dimensions.autonomy_budget.missingEvidence).toContain(
      "autonomy_budget_not_tracked"
    );
    expect(profile.dimensions.provenance.drivers).toEqual(
      expect.arrayContaining([
        "provenance_untrusted",
        "delegated_action_provenance_unknown"
      ])
    );
  });

  it("keeps top drivers deterministic and driven by highest dimension scores", () => {
    const first = profileFor({
      workspaceBoundaryViolation: true,
      commandRiskScore: "critical",
      validationStatus: "not_run",
      validationRequired: true
    });
    const second = profileFor({
      workspaceBoundaryViolation: true,
      commandRiskScore: "critical",
      validationStatus: "not_run",
      validationRequired: true
    });

    expect(second.topDrivers).toEqual(first.topDrivers);
    expect(first.topDrivers[0]).toBe("workspace_boundary_violation");
    expect(first.overallScore).toBe(0.9);
    expect(first.overallLevel).toBe("critical");
  });
});
