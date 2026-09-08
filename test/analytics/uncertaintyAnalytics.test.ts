import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAnalyticsSummary,
  formatAnalyticsSummary,
  readAnalyticsEvents,
  recordAnalyticsEvent,
  recordUncertaintyProfileCreated,
  recordUncertaintyReductionPlanCreated,
  recordUncertaintyRouterRecommendationCreated,
  resolveAnalyticsEventsPath
} from "../../src/analytics/index.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };

const tempDirs: string[] = [];
const originalAnalyticsEnv = process.env.CODING_ACTION_GATE_ANALYTICS;

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-uncertainty-analytics-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

const readRawAnalytics = (cwd: string): Promise<string> =>
  readFile(resolveAnalyticsEventsPath({ cwd }), "utf8");

const writeAction = async (
  cwd: string,
  fixture: unknown,
  filename = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, filename);

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
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

const profile = () =>
  buildUncertaintyProfile({
    signals: {
      targetFileReadRecently: false,
      validationRequired: true,
      validationStatus: "not_run",
      commandRiskScore: "critical",
      environmentClassification: "production"
    },
    autonomyBudget: {
      retryBudgetStatus: "exceeded"
    }
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

describe("uncertainty analytics", () => {
  it("records sanitized uncertainty profile, plan, and router events", async () => {
    const cwd = await createTempDir();
    const builtProfile = profile();
    const routerResult = routeUncertainty(builtProfile);

    await recordUncertaintyProfileCreated({
      cwd,
      profile: builtProfile,
      actionTypeCategory: "edit_file",
      decisionCategory: "DEFER"
    });
    await recordUncertaintyReductionPlanCreated({
      cwd,
      plan: builtProfile.uncertaintyReductionPlan!,
      topDrivers: builtProfile.topDrivers,
      actionTypeCategory: "edit_file"
    });
    await recordUncertaintyRouterRecommendationCreated({
      cwd,
      routerResult,
      topDrivers: builtProfile.topDrivers,
      decisionCategory: "BLOCK"
    });

    const events = await readAnalyticsEvents({ cwd });

    expect(events.map((event) => event.eventType)).toEqual([
      "uncertainty_profile_created",
      "uncertainty_reduction_plan_created",
      "uncertainty_router_recommendation_created"
    ]);
    expect(events[0]?.payload).toMatchObject({
      schemaVersion: "uncertainty-profile.v1",
      overallLevel: "critical",
      overallScoreBucket: "critical",
      reductionPlanAvailable: true
    });
    expect(events[0]?.payload).not.toHaveProperty("overallScore");
    expect(events[0]?.payload).not.toHaveProperty("dimensions");
    expect(events[0]?.payload).not.toHaveProperty("uncertaintyReductionPlan");
    expect(events[1]?.payload).toMatchObject({
      schemaVersion: "uncertainty-reduction-plan.v1",
      reductionStepKinds: expect.arrayContaining([
        "run_validation",
        "stop_and_request_human_review"
      ])
    });
    expect(events[1]?.payload).not.toHaveProperty("steps");
    expect(events[2]?.payload).toMatchObject({
      schemaVersion: "uncertainty-router-result.v1",
      routerRecommendedDecision: "BLOCK",
      routerConfidence: "high"
    });
    expect(events[2]?.payload).not.toHaveProperty("drivers");
    expect(events[2]?.payload).not.toHaveProperty("blockingDrivers");
  });

  it("drops unsafe and unknown fields for direct uncertainty event recording", async () => {
    const cwd = await createTempDir();

    await recordAnalyticsEvent({
      cwd,
      eventType: "uncertainty_profile_created",
      source: "runtime",
      payload: {
        schemaVersion: "uncertainty-profile.v1",
        overallLevel: "high",
        overallScoreBucket: "high",
        impact: "high",
        reducibility: "reducible",
        dimensionsPresent: ["context", "/tmp/private/project/src/file.ts"],
        topDrivers: [
          "target_file_not_observed",
          "/Users/example/private-repo/src/auth/login.ts",
          "command_risk_critical",
          "validation_missing",
          "retry_budget_exceeded",
          "sensitive_path_detected",
          "destructive_operation_recovery_unknown"
        ],
        dimensionLevels: {
          context: "high",
          "/tmp/private/project/src/file.ts": "critical"
        },
        dimensionImpacts: { context: "high" },
        dimensionReducibility: { context: "reducible" },
        reductionPlanAvailable: true,
        reductionStepCount: 2,
        rawProfile: profile(),
        command: "npm run deploy -- --token secret",
        prompt: "please rewrite the whole repo again",
        repo: "private-repo-name",
        branchName: "feature/customer-prod",
        unknownRawValue: "api.internal.customer.local"
      }
    });

    const raw = await readRawAnalytics(cwd);
    const [event] = await readAnalyticsEvents({ cwd });

    expect(event?.payload).not.toHaveProperty("rawProfile");
    expect(event?.payload).not.toHaveProperty("unknownRawValue");
    expect(
      (event?.payload as { topDrivers?: string[] }).topDrivers
    ).toHaveLength(5);
    expect(raw).toContain("target_file_not_observed");
    expectNoRawStrings(raw);
  });

  it("respects analytics opt-out for uncertainty helpers", async () => {
    const cwd = await createTempDir();

    process.env.CODING_ACTION_GATE_ANALYTICS = "off";
    await recordUncertaintyProfileCreated({
      cwd,
      profile: profile()
    });

    const events = await readAnalyticsEvents({ cwd });

    expect(events).toEqual([]);
  });

  it("keeps analytics write failures fail-safe", async () => {
    const cwdFile = path.join(await createTempDir(), "not-a-dir");

    await writeFile(cwdFile, "file", "utf8");

    await expect(
      recordUncertaintyProfileCreated({
        cwd: cwdFile,
        profile: profile()
      })
    ).resolves.toBeUndefined();
  });

  it("summarizes uncertainty analytics without exposing raw values", async () => {
    const cwd = await createTempDir();
    const builtProfile = profile();
    const routerResult = routeUncertainty(builtProfile);

    await recordUncertaintyProfileCreated({
      cwd,
      profile: builtProfile
    });
    await recordUncertaintyReductionPlanCreated({
      cwd,
      plan: builtProfile.uncertaintyReductionPlan!,
      topDrivers: builtProfile.topDrivers
    });
    await recordUncertaintyRouterRecommendationCreated({
      cwd,
      routerResult,
      topDrivers: builtProfile.topDrivers
    });
    await recordAnalyticsEvent({
      cwd,
      eventType: "uncertainty_router_recommendation_created",
      source: "runtime",
      payload: {
        routerRecommendedDecision: "DEFER",
        routerConfidence: "medium",
        routerRationale: ["reducible_uncertainty_with_reduction_plan"],
        blockingDriverCount: 0,
        deferDriverCount: 1,
        escalationDriverCount: 0,
        reductionPlanAvailable: true,
        topDrivers: ["validation_missing"],
        command: "rm -rf .",
        prompt: "try again until it works",
        url: "https://example.invalid/private"
      }
    });

    const summary = await buildAnalyticsSummary({ cwd });
    const formatted = formatAnalyticsSummary(summary);
    const json = JSON.stringify(summary);

    expect(summary.uncertainty.uncertaintyProfileCount).toBe(1);
    expect(summary.uncertainty.uncertaintyReductionPlanCount).toBe(1);
    expect(summary.uncertainty.uncertaintyRouterRecommendationCount).toBe(2);
    expect(summary.uncertainty.byOverallLevel.critical).toBe(1);
    expect(summary.uncertainty.routerRecommendations.BLOCK).toBe(1);
    expect(summary.uncertainty.routerRecommendations.DEFER).toBe(1);
    expect(
      summary.uncertainty.byTopDriver.command_risk_critical
    ).toBeGreaterThan(0);
    expect(summary.uncertainty.byTopDriver.validation_missing).toBeGreaterThan(
      0
    );
    expect(
      summary.uncertainty.reductionStepKinds.stop_and_request_human_review
    ).toBeGreaterThan(0);
    expect(JSON.parse(json)).toEqual(summary);
    expect(formatted).toContain("Uncertainty events");
    expect(formatted).toContain("- uncertainty_profile_created: 1");
    expectNoRawStrings(formatted);
    expectNoRawStrings(json);
  });

  it("handles no uncertainty events in summary", async () => {
    const summary = await buildAnalyticsSummary({ cwd: await createTempDir() });

    expect(summary.uncertainty.uncertaintyProfileCount).toBe(0);
    expect(summary.uncertainty.uncertaintyReductionPlanCount).toBe(0);
    expect(summary.uncertainty.uncertaintyRouterRecommendationCount).toBe(0);
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
