import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { StepHarborSignals } from "../../src/domain/signals.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-recovery-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const profileFor = (signals: StepHarborSignals) =>
  buildUncertaintyProfile({ signals });

const stepKinds = (signals: StepHarborSignals) =>
  profileFor(signals).uncertaintyReductionPlan?.steps.map(
    (step) => step.kind
  ) ?? [];

const writeAction = async (
  cwd: string,
  fixture: unknown,
  filename = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, filename);

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
};

describe("recovery uncertainty", () => {
  it("keeps recovery low for default non-destructive profiles", () => {
    const profile = buildUncertaintyProfile();

    expect(profile.dimensions.recovery).toMatchObject({
      score: 0,
      level: "low",
      impact: "low",
      reducibility: "reducible",
      drivers: [],
      evidence: [],
      missingEvidence: []
    });
  });

  it("maps destructive operations with unknown recovery state", () => {
    const profile = profileFor({ destructiveOperation: true });

    expect(profile.dimensions.recovery.drivers).toEqual(
      expect.arrayContaining([
        "destructive_file_change_detected",
        "recovery_state_unknown",
        "rollback_confidence_unknown",
        "destructive_operation_recovery_unknown",
        "recovery_checkpoint_missing",
        "git_tracking_unknown"
      ])
    );
    expect(profile.dimensions.recovery.missingEvidence).toEqual(
      expect.arrayContaining([
        "recovery_checkpoint_available",
        "recovery_state_classified"
      ])
    );
    expect(profile.dimensions.recovery.level).toBe("high");
  });

  it("maps delete, overwrite, and irreversible operation recovery drivers", () => {
    const deletion = profileFor({
      destructiveOperation: true,
      destructiveSubtype: "delete_file"
    });
    const overwrite = profileFor({
      destructiveOperation: true,
      destructiveSubtype: "overwrite_file"
    });
    const irreversible = profileFor({
      destructiveOperation: true,
      destructiveSeverity: "critical"
    });

    expect(deletion.dimensions.recovery.drivers).toContain(
      "delete_operation_detected"
    );
    expect(overwrite.dimensions.recovery.drivers).toContain(
      "overwrite_operation_detected"
    );
    expect(irreversible.dimensions.recovery.drivers).toContain(
      "irreversible_operation_risk"
    );
    expect(irreversible.dimensions.recovery.level).toBe("critical");
  });

  it("maps recovery evidence and lowers recovery uncertainty", () => {
    const unknown = profileFor({ destructiveOperation: true });
    const evidenced = profileFor({
      destructiveOperation: true,
      repoIntegrityStatus: "clean",
      isDirtyWorktree: false,
      validationStatus: "passed",
      targetFileFreshness: "fresh",
      currentFileHash: "hash"
    });

    expect(evidenced.dimensions.recovery.score).toBeLessThan(
      unknown.dimensions.recovery.score
    );
    expect(evidenced.dimensions.recovery.level).toBe("medium");
    expect(evidenced.dimensions.recovery.evidence).toEqual(
      expect.arrayContaining([
        "git_state_available",
        "git_tracking_available",
        "git_worktree_clean",
        "validation_recovery_evidence_available",
        "target_file_hash_available",
        "recovery_state_classified",
        "rollback_confidence_medium"
      ])
    );
    expect(evidenced.dimensions.recovery.drivers).not.toContain(
      "recovery_state_unknown"
    );
  });

  it("maps dirty git, validation, workspace, and tracking recovery evidence", () => {
    const profile = profileFor({
      destructiveOperation: true,
      repoIntegrityStatus: "dirty",
      isDirtyWorktree: true,
      validationRequired: true,
      validationStatus: "not_run",
      workspaceBoundaryStatus: "unknown"
    });

    expect(profile.dimensions.recovery.evidence).toEqual(
      expect.arrayContaining([
        "git_state_available",
        "git_tracking_available",
        "git_worktree_dirty"
      ])
    );
    expect(profile.dimensions.recovery.drivers).toEqual(
      expect.arrayContaining([
        "validation_recovery_evidence_missing",
        "workspace_recovery_boundary_unknown"
      ])
    );
  });

  it("maps workspace boundary violation with destructive operation to block-level boundary risk", () => {
    const profile = profileFor({
      destructiveOperation: true,
      workspaceBoundaryViolation: true
    });
    const result = routeUncertainty(profile);

    expect(profile.dimensions.workspace_boundary.drivers).toContain(
      "workspace_boundary_violation"
    );
    expect(profile.dimensions.recovery.drivers).toContain(
      "irreversible_operation_risk"
    );
    expect(result.recommendedDecision).toBe("BLOCK");
    expect(result.blockingDrivers).toContain("workspace_boundary_violation");
  });

  it("maps critical destructive commands to command and recovery risk", () => {
    const profile = profileFor({
      destructiveOperation: true,
      destructiveSeverity: "critical",
      commandRiskScore: "critical"
    });
    const result = routeUncertainty(profile);

    expect(profile.dimensions.command.drivers).toEqual(
      expect.arrayContaining([
        "command_risk_critical",
        "destructive_command_detected"
      ])
    );
    expect(profile.dimensions.recovery.drivers).toContain(
      "irreversible_operation_risk"
    );
    expect(result.recommendedDecision).toBe("BLOCK");
  });

  it("creates recovery reduction plan steps for unknown recovery", () => {
    const profile = profileFor({ destructiveOperation: true });

    expect(profile.uncertaintyReductionPlan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "inspect_recovery_state",
          driversAddressed: expect.arrayContaining([
            "destructive_operation_recovery_unknown",
            "recovery_state_unknown"
          ])
        }),
        expect.objectContaining({
          kind: "create_checkpoint",
          driversAddressed: expect.arrayContaining([
            "destructive_operation_recovery_unknown",
            "recovery_checkpoint_missing"
          ])
        }),
        expect.objectContaining({
          kind: "inspect_git_state",
          driversAddressed: ["git_tracking_unknown"]
        })
      ])
    );
  });

  it("creates human review plans for irreversible operation risk", () => {
    const profile = profileFor({
      destructiveOperation: true,
      destructiveSeverity: "critical"
    });

    expect(
      stepKinds({
        destructiveOperation: true,
        destructiveSeverity: "critical"
      })
    ).toContain("stop_and_request_human_review");
    expect(profile.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("does not create checkpoint artifacts or run recovery actions", async () => {
    const cwd = await createTempDir();
    const before = await readdir(cwd);

    const profile = profileFor({ destructiveOperation: true });

    const after = await readdir(cwd);
    expect(
      profile.uncertaintyReductionPlan?.steps.map((step) => step.kind)
    ).toContain("create_checkpoint");
    expect(after).toEqual(before);
  });

  it("routes ordinary destructive unknown recovery to advisory DEFER", () => {
    const result = routeUncertainty(profileFor({ destructiveOperation: true }));

    expect(result.recommendedDecision).toBe("DEFER");
    expect(result.deferDrivers).toEqual(
      expect.arrayContaining([
        "destructive_operation_recovery_unknown",
        "recovery_state_unknown"
      ])
    );
    expect(result.rationale).toContain(
      "recovery_uncertainty_requires_evidence"
    );
  });

  it("routes irreversible recovery risk to advisory ESCALATE", () => {
    const result = routeUncertainty(
      profileFor({
        destructiveOperation: true,
        destructiveSeverity: "critical"
      })
    );

    expect(result.recommendedDecision).toBe("ESCALATE");
    expect(result.escalationDrivers).toContain("irreversible_operation_risk");
    expect(result.recommendedDecision).not.toBe("PROCEED");
  });

  it("does not force recovery DEFER when recovery evidence is available", () => {
    const result = routeUncertainty(
      profileFor({
        destructiveOperation: true,
        repoIntegrityStatus: "clean",
        isDirtyWorktree: false,
        validationStatus: "passed",
        targetFileFreshness: "fresh",
        currentFileHash: "hash"
      })
    );

    expect(result.deferDrivers).not.toContain("recovery_state_unknown");
    expect(result.recommendedDecision).toBe("ESCALATE");
  });

  it("keeps production and command block precedence over recovery uncertainty", () => {
    const production = routeUncertainty(
      profileFor({
        destructiveOperation: true,
        environmentClassification: "production"
      })
    );
    const criticalCommand = routeUncertainty(
      profileFor({
        destructiveOperation: true,
        commandRiskScore: "critical"
      })
    );

    expect(production.recommendedDecision).toBe("BLOCK");
    expect(production.blockingDrivers).toContain(
      "production_environment_detected"
    );
    expect(criticalCommand.recommendedDecision).toBe("BLOCK");
    expect(criticalCommand.blockingDrivers).toContain("command_risk_critical");
  });

  it("does not serialize raw recovery-related values", () => {
    const rawStrings = [
      "/Users/example/private-repo/src/auth/login.ts",
      "/tmp/private/project/src/file.ts",
      "C:\\Users\\example\\private-repo\\src\\security\\roles.ts",
      "rm -rf .",
      "git reset --hard HEAD~5",
      "git clean -fdx",
      "private-repo-name",
      "feature/customer-prod",
      "diff --git a/src/auth.ts b/src/auth.ts",
      "validation log: secret token appeared here",
      "API_KEY=secret-value"
    ];
    const profile = profileFor({
      destructiveOperation: true,
      destructiveSubtype: "delete_file",
      destructiveSeverity: "critical",
      destructiveReason: "git reset --hard HEAD~5",
      commandRiskReason: "rm -rf .",
      pathSensitivityReason: "/Users/example/private-repo/src/auth/login.ts",
      workspaceBoundaryReason: "/tmp/private/project/src/file.ts",
      gitWorkflowReason: "private-repo-name",
      currentBranch: "feature/customer-prod",
      validationReason: "validation log: secret token appeared here",
      secretDetectionReason: "API_KEY=secret-value"
    });
    const serializedProfile = JSON.stringify(profile);
    const serializedPlan = JSON.stringify(profile.uncertaintyReductionPlan);
    const serializedRouter = JSON.stringify(routeUncertainty(profile));

    for (const raw of rawStrings) {
      expect(serializedProfile).not.toContain(raw);
      expect(serializedPlan).not.toContain(raw);
      expect(serializedRouter).not.toContain(raw);
    }

    for (const raw of ["main", "production"]) {
      expect(serializedProfile).not.toContain(`"${raw}"`);
      expect(serializedPlan).not.toContain(`"${raw}"`);
      expect(serializedRouter).not.toContain(`"${raw}"`);
    }
  });

  it("preserves representative production routing behavior", async () => {
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
