import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { decide } from "../../src/decision/decisionEngine.js";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import {
  uncertaintyDimensions,
  uncertaintyProfileSchema
} from "../../src/uncertainty/uncertaintyTypes.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };
import authEdit from "../../examples/actions/phase2/auth-edit.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-uncertainty-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const normalizeFixture = (fixture: unknown) => {
  const result = parseAndNormalizeAction(fixture, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const writeAction = async (
  cwd: string,
  fixture: unknown,
  filename = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, filename);

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
};

describe("buildUncertaintyProfile", () => {
  it("builds a deterministic default skeleton profile", () => {
    const profile = buildUncertaintyProfile();

    expect(uncertaintyProfileSchema.parse(profile)).toEqual(profile);
    expect(profile).toMatchObject({
      schemaVersion: "uncertainty-profile.v1",
      overallScore: 0,
      overallLevel: "low",
      impact: "low",
      reducibility: "reducible",
      topDrivers: []
    });
    expect(Object.keys(profile.dimensions).sort()).toEqual(
      [...uncertaintyDimensions].sort()
    );
    expect(profile.recommendedDecision).toBeUndefined();
  });

  it("keeps low-risk evidence low without changing defaults", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: true,
        targetFileFreshness: "fresh",
        validationRequired: false,
        commandRiskScore: "low",
        workspaceBoundaryStatus: "inside",
        branchRisk: "low",
        environmentClassification: "dev",
        autonomyBudgetStatus: "ok",
        delegationProvenance: "trusted"
      }
    });

    expect(profile.overallScore).toBe(0);
    expect(profile.overallLevel).toBe("low");
    expect(profile.dimensions.freshness.evidence).toContain(
      "target_file_hash_available"
    );
    expect(profile.dimensions.command.evidence).toContain("command_classified");
  });

  it("maps context and freshness uncertainty from existing signals", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: false,
        targetFileFreshness: "stale",
        relatedTestsFound: true,
        relatedTestsRead: false,
        contextCompletenessScore: 0.4
      }
    });

    expect(profile.dimensions.context.drivers).toEqual(
      expect.arrayContaining([
        "target_file_not_observed",
        "related_tests_not_observed",
        "context_completeness_low"
      ])
    );
    expect(profile.dimensions.freshness.drivers).toContain("target_file_stale");
    expect(profile.overallLevel).toBe("high");
  });

  it("maps command, sensitivity, workspace, git, and environment signals", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        commandRiskScore: "critical",
        pipeToShell: true,
        pathSensitivity: "critical",
        secretPathMatch: true,
        secretTouch: "confirmed",
        workspaceBoundaryViolation: true,
        forcePush: true,
        protectedBranch: true,
        directMainlinePush: true,
        branchRisk: "critical",
        environmentClassification: "production"
      }
    });

    expect(profile.topDrivers).toEqual(
      expect.arrayContaining([
        "workspace_boundary_violation",
        "command_risk_critical"
      ])
    );
    expect(profile.dimensions.git_workflow.drivers).toEqual(
      expect.arrayContaining(["force_push_detected", "protected_branch_risk"])
    );
    expect(profile.dimensions.environment.drivers).toContain(
      "production_environment_detected"
    );
    expect(profile.dimensions.sensitivity.drivers).toEqual(
      expect.arrayContaining([
        "sensitive_path_detected",
        "sensitive_surface_detected",
        "secret_path_detected",
        "secret_material_detected"
      ])
    );
    expect(profile.overallScore).toBe(0.9);
    expect(profile.overallLevel).toBe("critical");
    expect(profile.impact).toBe("critical");
  });

  it("maps validation, recovery, autonomy, and provenance signals", () => {
    const profile = buildUncertaintyProfile({
      signals: {
        validationRequired: true,
        validationStatus: "not_run",
        destructiveOperation: true,
        autonomyBudgetStatus: "exceeded",
        delegationProvenance: "unknown"
      }
    });

    expect(profile.dimensions.validation.drivers).toContain(
      "validation_missing"
    );
    expect(profile.dimensions.recovery.drivers).toContain(
      "recovery_state_unknown"
    );
    expect(profile.dimensions.recovery.drivers).toContain(
      "destructive_operation_recovery_unknown"
    );
    expect(profile.dimensions.autonomy_budget.drivers).toContain(
      "autonomy_budget_exceeded"
    );
    expect(profile.dimensions.provenance.drivers).toContain(
      "provenance_unknown"
    );
  });

  it("does not affect decision engine routing when built separately", () => {
    const action = normalizeFixture(authEdit);
    const decisionWithoutProfile = decide({
      action,
      policy: defaultPolicy,
      signals: {
        pathSensitivity: "high",
        targetFileFreshness: "fresh"
      }
    });
    const profile = buildUncertaintyProfile({
      signals: {
        pathSensitivity: "high",
        targetFileFreshness: "fresh"
      }
    });
    const decisionAfterProfileBuild = decide({
      action,
      policy: defaultPolicy,
      signals: {
        pathSensitivity: "high",
        targetFileFreshness: "fresh"
      }
    });

    expect(profile.recommendedDecision).toBeUndefined();
    expect(decisionWithoutProfile).toMatchObject({
      ok: true,
      decision: {
        decision: "ESCALATE"
      }
    });
    expect(decisionAfterProfileBuild).toEqual(decisionWithoutProfile);
  });

  it("preserves representative routing behavior", async () => {
    const cwd = await createTempDir();
    const proceedPolicyPath = path.join(cwd, "proceed.policy.yml");
    const proceedActionPath = await writeAction(
      cwd,
      safeReadmeEdit,
      "proceed-action.json"
    );
    const deferActionPath = await writeAction(
      cwd,
      {
        ...safeReadmeEdit,
        id: "stale-edit"
      },
      "defer-action.json"
    );

    await writeFile(
      proceedPolicyPath,
      [
        "version: 0.1",
        "rules:",
        "  - id: allow-all",
        "    decision: PROCEED",
        "    when:",
        "      action_type: edit_file"
      ].join("\n"),
      "utf8"
    );

    const proceed = await runDecideCommand({
      actionFile: proceedActionPath,
      cwd,
      policy: proceedPolicyPath,
      noAudit: true
    });
    const defer = await runDecideCommand({
      actionFile: deferActionPath,
      cwd,
      noAudit: true
    });
    const escalate = await runExecCommand({
      command: "sudo ls",
      cwd,
      noAudit: true
    });
    const block = await runExecCommand({
      command: "rm -rf .",
      cwd,
      noAudit: true
    });

    expect(proceed).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "PROCEED"
        }
      }
    });
    expect(defer).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "DEFER"
        }
      }
    });
    expect(escalate).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "ESCALATE"
        }
      }
    });
    expect(block).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "BLOCK"
        }
      }
    });
  });
});
