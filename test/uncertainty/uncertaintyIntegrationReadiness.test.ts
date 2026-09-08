import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAnalyticsSummary,
  formatAnalyticsSummary,
  readAnalyticsEvents,
  recordUncertaintyProfileCreated,
  recordUncertaintyReductionPlanCreated,
  recordUncertaintyRouterRecommendationCreated,
  resolveAnalyticsEventsPath,
  sanitizedUncertaintyProfilePayload,
  sanitizedUncertaintyReductionPlanPayload,
  sanitizedUncertaintyRouterPayload
} from "../../src/analytics/index.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { CodingActionGateSignals } from "../../src/domain/signals.js";
import {
  buildUncertaintyProfile,
  type AutonomyBudgetProfileInput
} from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import {
  uncertaintyDimensions,
  uncertaintyProfileSchemaVersion,
  uncertaintyReductionPlanSchemaVersion
} from "../../src/uncertainty/uncertaintyTypes.js";
import { uncertaintyRouterResultSchemaVersion } from "../../src/uncertainty/uncertaintyRouter.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };

const tempDirs: string[] = [];
const originalAnalyticsEnv = process.env.CODING_ACTION_GATE_ANALYTICS;

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-uq-ready-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  if (originalAnalyticsEnv === undefined) {
    delete process.env.CODING_ACTION_GATE_ANALYTICS;
  } else {
    process.env.CODING_ACTION_GATE_ANALYTICS = originalAnalyticsEnv;
  }

  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const rawStrings = [
  "/Users/example/private-repo/src/auth/login.ts",
  "/tmp/private/project/src/file.ts",
  "C:\\Users\\example\\private-repo\\src\\security\\roles.ts",
  "npm run deploy -- --token secret",
  "rm -rf .",
  "please rewrite the whole repo again",
  "try again until it works",
  "private-repo-name",
  "feature/customer-prod",
  "https://example.invalid/private",
  "api.internal.customer.local",
  "diff --git a/src/auth.ts b/src/auth.ts",
  "validation log: secret token appeared here",
  "API_KEY=secret-value",
  "STRIPE_SECRET_KEY=sk_test_secret"
];

const expectNoRawStrings = (content: string): void => {
  for (const raw of rawStrings) {
    expect(content).not.toContain(raw);
  }

  for (const raw of ["main", "production"]) {
    expect(content).not.toContain(`"${raw}"`);
  }
};

const multiSignalInput = (): {
  signals: CodingActionGateSignals;
  autonomyBudget: AutonomyBudgetProfileInput;
} => ({
  signals: {
    targetFileReadRecently: false,
    targetFileFreshness: "stale",
    fileChangedSinceRead: true,
    validationRequired: true,
    validationStatus: "not_run",
    pathSensitivity: "high",
    commandRiskScore: "unknown",
    destructiveOperation: true,
    destructiveSubtype: "delete_file",
    workspaceBoundaryStatus: "unknown",
    environmentClassification: "unknown",
    landingAction: true,
    landingActionType: "deploy",
    delegationProvenance: "unknown",
    pathSensitivityReason: "/Users/example/private-repo/src/auth/login.ts",
    commandRiskReason: "npm run deploy -- --token secret",
    destructiveReason: "rm -rf .",
    workspaceBoundaryReason: "/tmp/private/project/src/file.ts",
    currentBranch: "feature/customer-prod",
    gitWorkflowReason: "private-repo-name",
    validationReason: "validation log: secret token appeared here",
    secretDetectionReason: "API_KEY=secret-value",
    externalUrlSource: "https://example.invalid/private"
  },
  autonomyBudget: {
    retryBudgetStatus: "warning",
    progressState: "unknown",
    actionScope: "broad"
  }
});

const buildMultiSignalProfile = () =>
  buildUncertaintyProfile(multiSignalInput());

const writeAction = async (
  cwd: string,
  fixture: unknown,
  filename = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, filename);

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
};

describe("Phase 10A uncertainty integration readiness", () => {
  it("keeps schema versions stable", () => {
    expect(uncertaintyProfileSchemaVersion).toBe("uncertainty-profile.v1");
    expect(uncertaintyReductionPlanSchemaVersion).toBe(
      "uncertainty-reduction-plan.v1"
    );
    expect(uncertaintyRouterResultSchemaVersion).toBe(
      "uncertainty-router-result.v1"
    );
  });

  it("keeps every dimension present with the default low profile shape", () => {
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

    expect(routeUncertainty(profile).recommendedDecision).toBe("PROCEED");
  });

  it("flows profile to plan to router to sanitized analytics payloads", async () => {
    const cwd = await createTempDir();
    const profile = buildMultiSignalProfile();
    const routerResult = routeUncertainty(profile);
    const plan = profile.uncertaintyReductionPlan;

    expect(profile.schemaVersion).toBe("uncertainty-profile.v1");
    expect(plan?.schemaVersion).toBe("uncertainty-reduction-plan.v1");
    expect(routerResult.schemaVersion).toBe("uncertainty-router-result.v1");
    expect(plan).toBeDefined();

    const profilePayload = sanitizedUncertaintyProfilePayload(profile);
    const planPayload = sanitizedUncertaintyReductionPlanPayload(plan!, {
      topDrivers: profile.topDrivers
    });
    const routerPayload = sanitizedUncertaintyRouterPayload(routerResult, {
      topDrivers: profile.topDrivers
    });

    expect(profilePayload).not.toHaveProperty("dimensions");
    expect(profilePayload).not.toHaveProperty("overallScore");
    expect(planPayload).not.toHaveProperty("steps");
    expect(routerPayload).not.toHaveProperty("drivers");
    expect(routerPayload).not.toHaveProperty("blockingDrivers");

    await recordUncertaintyProfileCreated({ cwd, profile });
    await recordUncertaintyReductionPlanCreated({
      cwd,
      plan: plan!,
      topDrivers: profile.topDrivers
    });
    await recordUncertaintyRouterRecommendationCreated({
      cwd,
      routerResult,
      topDrivers: profile.topDrivers
    });

    const rawEvents = await readFile(
      resolveAnalyticsEventsPath({ cwd }),
      "utf8"
    );
    const summary = await buildAnalyticsSummary({ cwd });
    const summaryJson = JSON.stringify(summary);
    const summaryText = formatAnalyticsSummary(summary);

    expect(
      (await readAnalyticsEvents({ cwd })).map((event) => event.eventType)
    ).toEqual([
      "uncertainty_profile_created",
      "uncertainty_reduction_plan_created",
      "uncertainty_router_recommendation_created"
    ]);
    expect(summary.uncertainty.uncertaintyProfileCount).toBe(1);
    expect(summary.uncertainty.uncertaintyReductionPlanCount).toBe(1);
    expect(summary.uncertainty.uncertaintyRouterRecommendationCount).toBe(1);
    expect(
      Object.values(summary.uncertainty.byTopDriver).reduce(
        (total, count) => total + count,
        0
      )
    ).toBeGreaterThan(0);

    for (const serialized of [
      JSON.stringify(profile),
      JSON.stringify(plan),
      JSON.stringify(routerResult),
      JSON.stringify(profilePayload),
      JSON.stringify(planPayload),
      JSON.stringify(routerPayload),
      rawEvents,
      summaryJson,
      summaryText
    ]) {
      expectNoRawStrings(serialized);
    }
  });

  it("is deterministic for identical profile, plan, and router inputs", () => {
    const first = buildMultiSignalProfile();
    const second = buildMultiSignalProfile();

    expect(second.topDrivers).toEqual(first.topDrivers);
    expect(second.uncertaintyReductionPlan?.steps).toEqual(
      first.uncertaintyReductionPlan?.steps
    );
    expect(routeUncertainty(second)).toEqual(routeUncertainty(first));
  });

  it("preserves router precedence across Phase 10A driver families", () => {
    const block = routeUncertainty(
      buildUncertaintyProfile({
        signals: {
          commandRiskScore: "critical",
          pathSensitivity: "high",
          targetFileReadRecently: false
        },
        autonomyBudget: {
          retryBudgetStatus: "exceeded"
        }
      })
    );
    const sensitiveMissing = routeUncertainty(
      buildUncertaintyProfile({
        signals: {
          pathSensitivity: "high",
          targetFileReadRecently: false
        }
      })
    );
    const sensitiveReady = routeUncertainty(
      buildUncertaintyProfile({
        signals: {
          pathSensitivity: "high",
          targetFileReadRecently: true
        }
      })
    );
    const secret = routeUncertainty(
      buildUncertaintyProfile({
        signals: {
          secretPathMatch: true
        }
      })
    );
    const production = routeUncertainty(
      buildUncertaintyProfile({
        signals: {
          environmentClassification: "production"
        }
      })
    );
    const retryExceeded = routeUncertainty(
      buildUncertaintyProfile({
        autonomyBudget: {
          retryBudgetStatus: "exceeded"
        }
      })
    );
    const recoveryUnknown = routeUncertainty(
      buildUncertaintyProfile({
        signals: {
          destructiveOperation: true
        }
      })
    );

    expect(block.recommendedDecision).toBe("BLOCK");
    expect(block.blockingDrivers).toContain("command_risk_critical");
    expect(sensitiveMissing.recommendedDecision).toBe("DEFER");
    expect(sensitiveReady.recommendedDecision).toBe("ESCALATE");
    expect(secret.recommendedDecision).toBe("BLOCK");
    expect(production.recommendedDecision).toBe("BLOCK");
    expect(retryExceeded.recommendedDecision).toBe("ESCALATE");
    expect(recoveryUnknown.recommendedDecision).toBe("DEFER");
  });

  it("keeps reduction plans stable, metadata-only, and conservative", async () => {
    const cwd = await createTempDir();
    const before = await readdirSafe(cwd);
    const critical = buildUncertaintyProfile({
      signals: {
        commandRiskScore: "critical",
        secretPathMatch: true
      }
    });
    const duplicated = buildUncertaintyProfile({
      signals: {
        targetFileReadRecently: false,
        targetFileFreshness: "unknown"
      }
    });
    const after = await readdirSafe(cwd);

    expect(after).toEqual(before);
    expect(
      critical.uncertaintyReductionPlan?.steps.map((step) => step.kind)
    ).toContain("stop_and_request_human_review");
    expect(critical.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
    expect(
      duplicated.uncertaintyReductionPlan?.steps.filter(
        (step) => step.kind === "read_target_file"
      )
    ).toHaveLength(1);
  });

  it("respects uncertainty analytics opt-out and skips malformed summary lines", async () => {
    const cwd = await createTempDir();

    process.env.CODING_ACTION_GATE_ANALYTICS = "0";
    await recordUncertaintyProfileCreated({
      cwd,
      profile: buildMultiSignalProfile()
    });
    expect(await readAnalyticsEvents({ cwd })).toEqual([]);

    delete process.env.CODING_ACTION_GATE_ANALYTICS;
    const analyticsDir = path.join(cwd, ".coding-action-gate", "analytics");
    await mkdir(analyticsDir, { recursive: true });
    await writeFile(
      path.join(analyticsDir, "events.jsonl"),
      [
        JSON.stringify({
          eventId: "event-1",
          eventType: "uncertainty_profile_created",
          timestamp: "2026-05-20T00:00:00.000Z",
          schemaVersion: "0.1",
          runId: "run-1",
          source: "runtime",
          payload: sanitizedUncertaintyProfilePayload(buildMultiSignalProfile())
        }),
        "not json with /tmp/private/project/src/file.ts and API_KEY=secret-value"
      ].join("\n")
    );

    const summary = await buildAnalyticsSummary({ cwd });
    const formatted = formatAnalyticsSummary(summary);

    expect(summary.status.skippedMalformedEvents).toBe(1);
    expect(summary.uncertainty.uncertaintyProfileCount).toBe(1);
    expectNoRawStrings(JSON.stringify(summary));
    expectNoRawStrings(formatted);
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

const readdirSafe = async (directory: string): Promise<string[]> => {
  try {
    return readdir(directory);
  } catch {
    return [];
  }
};
