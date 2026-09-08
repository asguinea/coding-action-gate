import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { CodingActionGateSignals } from "../../src/domain/signals.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import type { AutonomyBudgetProfileInput } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-autonomy-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const profileFor = (
  autonomyBudget: AutonomyBudgetProfileInput | undefined,
  signals: CodingActionGateSignals = {}
) =>
  buildUncertaintyProfile({
    signals,
    ...(autonomyBudget !== undefined ? { autonomyBudget } : {})
  });

const stepKinds = (autonomyBudget: AutonomyBudgetProfileInput | undefined) =>
  profileFor(autonomyBudget).uncertaintyReductionPlan?.steps.map(
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

describe("autonomy and budget uncertainty", () => {
  it("keeps autonomy budget low without autonomy signals", () => {
    const profile = buildUncertaintyProfile();

    expect(profile.dimensions.autonomy_budget).toMatchObject({
      score: 0,
      level: "low",
      impact: "low",
      reducibility: "reducible",
      drivers: [],
      evidence: [],
      missingEvidence: []
    });
  });

  it("maps relevant unknown autonomy budget to reducible uncertainty", () => {
    const profile = profileFor({ relevant: true });

    expect(profile.dimensions.autonomy_budget.level).toBe("medium");
    expect(profile.dimensions.autonomy_budget.drivers).toEqual(
      expect.arrayContaining([
        "autonomy_budget_unknown",
        "autonomy_budget_not_tracked"
      ])
    );
    expect(profile.dimensions.autonomy_budget.missingEvidence).toContain(
      "autonomy_budget_missing"
    );
    expect(stepKinds({ relevant: true })).toContain("narrow_action_scope");
    expect(routeUncertainty(profile).recommendedDecision).toBe("DEFER");
  });

  it("maps autonomy budget warning and exceeded states", () => {
    const warning = profileFor({ autonomyBudgetStatus: "warning" });
    const exceeded = profileFor({ autonomyBudgetStatus: "exceeded" });

    expect(warning.dimensions.autonomy_budget.drivers).toContain(
      "autonomy_budget_warning"
    );
    expect(warning.dimensions.autonomy_budget.level).toBe("high");
    expect(stepKinds({ autonomyBudgetStatus: "warning" })).toEqual(
      expect.arrayContaining([
        "narrow_action_scope",
        "refresh_context",
        "inspect_progress_state"
      ])
    );
    expect(exceeded.dimensions.autonomy_budget.drivers).toContain(
      "autonomy_budget_exceeded"
    );
    expect(exceeded.dimensions.autonomy_budget.level).toBe("critical");
    expect(routeUncertainty(exceeded).recommendedDecision).toBe("ESCALATE");
  });

  it("maps retry count, warning, and exceeded states", () => {
    const highCount = profileFor({ retryCount: 3 });
    const warning = profileFor({ retryBudgetStatus: "warning" });
    const exceeded = profileFor({ retryBudgetStatus: "exceeded" });

    expect(highCount.dimensions.autonomy_budget.drivers).toContain(
      "retry_count_high"
    );
    expect(warning.dimensions.autonomy_budget.drivers).toContain(
      "retry_budget_warning"
    );
    expect(exceeded.dimensions.autonomy_budget.drivers).toContain(
      "retry_budget_exceeded"
    );
    expect(stepKinds({ retryCount: 3 })).toEqual(
      expect.arrayContaining(["narrow_action_scope", "limit_retry_scope"])
    );
    expect(routeUncertainty(exceeded).recommendedDecision).toBe("ESCALATE");
    expect(routeUncertainty(exceeded).recommendedDecision).not.toBe("PROCEED");
  });

  it("maps repeated defer and no-progress states", () => {
    const repeated = profileFor({ repeatedDeferCount: 2 });
    const limitReached = profileFor({
      repeatedDeferCount: 4,
      repeatedDeferLimitReached: true
    });
    const noProgress = profileFor({ noNetProgress: true });

    expect(repeated.dimensions.autonomy_budget.drivers).toContain(
      "repeated_defer_detected"
    );
    expect(limitReached.dimensions.autonomy_budget.drivers).toContain(
      "repeated_defer_limit_reached"
    );
    expect(noProgress.dimensions.autonomy_budget.drivers).toContain(
      "no_net_progress_detected"
    );
    expect(routeUncertainty(repeated).recommendedDecision).toBe("DEFER");
    expect(routeUncertainty(limitReached).recommendedDecision).toBe("ESCALATE");
    expect(routeUncertainty(noProgress).recommendedDecision).toBe("ESCALATE");
  });

  it("maps context budget, action scope, progress, and diff churn states", () => {
    const profile = profileFor({
      contextBudgetStatus: "exceeded",
      actionScope: "broad",
      progressState: "unknown",
      diffChurn: "high"
    });

    expect(profile.dimensions.autonomy_budget.drivers).toEqual(
      expect.arrayContaining([
        "context_budget_exceeded",
        "action_scope_too_broad",
        "no_progress_evidence_missing",
        "diff_churn_high"
      ])
    );
    expect(profile.dimensions.autonomy_budget.evidence).toEqual(
      expect.arrayContaining([
        "context_budget_available",
        "action_scope_classified",
        "diff_churn_classified"
      ])
    );
    expect(routeUncertainty(profile).recommendedDecision).toBe("ESCALATE");
  });

  it("creates metadata-only autonomy reduction steps", async () => {
    const cwd = await createTempDir();
    const before = await readdir(cwd);
    const profile = profileFor({
      retryBudgetStatus: "warning",
      repeatedDeferCount: 2,
      progressState: "unknown"
    });
    const after = await readdir(cwd);

    expect(
      profile.uncertaintyReductionPlan?.steps.map((step) => step.kind)
    ).toEqual(
      expect.arrayContaining([
        "narrow_action_scope",
        "limit_retry_scope",
        "inspect_progress_state"
      ])
    );
    expect(after).toEqual(before);
  });

  it("keeps block precedence over autonomy budget uncertainty", () => {
    const profile = profileFor(
      {
        retryBudgetStatus: "warning",
        noNetProgress: true
      },
      {
        commandRiskScore: "critical"
      }
    );
    const result = routeUncertainty(profile);

    expect(result.recommendedDecision).toBe("BLOCK");
    expect(result.blockingDrivers).toContain("command_risk_critical");
  });

  it("preserves prior sensitivity and recovery advisory behavior", () => {
    const sensitiveMissing = buildUncertaintyProfile({
      signals: {
        pathSensitivity: "high",
        targetFileReadRecently: false
      }
    });
    const sensitiveReady = buildUncertaintyProfile({
      signals: {
        pathSensitivity: "high",
        targetFileReadRecently: true
      }
    });
    const recoveryUnknown = buildUncertaintyProfile({
      signals: {
        destructiveOperation: true
      }
    });

    expect(routeUncertainty(sensitiveMissing).recommendedDecision).toBe(
      "DEFER"
    );
    expect(routeUncertainty(sensitiveReady).recommendedDecision).toBe(
      "ESCALATE"
    );
    expect(routeUncertainty(recoveryUnknown).recommendedDecision).toBe("DEFER");
  });

  it("keeps top drivers deterministic for autonomy budget profiles", () => {
    const input = {
      retryBudgetStatus: "warning" as const,
      repeatedDeferCount: 2,
      actionScope: "broad" as const
    };
    const first = profileFor(input);
    const second = profileFor(input);

    expect(second.topDrivers).toEqual(first.topDrivers);
    expect(first.topDrivers).toEqual(
      expect.arrayContaining([
        "repeated_defer_detected",
        "retry_budget_warning",
        "action_scope_too_broad"
      ])
    );
  });

  it("does not serialize raw autonomy budget values", () => {
    const rawStrings = [
      "please rewrite the whole repo again",
      "try again until it works",
      "keep editing until tests pass",
      "npm run deploy -- --token secret",
      "rm -rf .",
      "/Users/example/private-repo/src/auth/login.ts",
      "feature/customer-prod",
      "private-repo-name",
      "diff --git a/src/auth.ts b/src/auth.ts",
      "validation log: secret token appeared here",
      "API_KEY=secret-value"
    ];
    const profile = buildUncertaintyProfile({
      signals: {
        commandRiskReason: "npm run deploy -- --token secret",
        destructiveReason: "rm -rf .",
        pathSensitivityReason: "/Users/example/private-repo/src/auth/login.ts",
        currentBranch: "feature/customer-prod",
        gitWorkflowReason: "private-repo-name",
        validationReason: "validation log: secret token appeared here",
        secretDetectionReason: "API_KEY=secret-value"
      },
      autonomyBudget: {
        autonomyBudgetStatus: "exceeded",
        retryBudgetStatus: "exceeded",
        repeatedDeferLimitReached: true,
        noNetProgress: true,
        actionScope: "broad",
        diffChurn: "high",
        contextBudgetStatus: "exceeded"
      }
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
