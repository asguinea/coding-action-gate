import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import {
  buildUncertaintyProfile,
  type BuildUncertaintyProfileInput
} from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { buildUncertaintyReductionPlan } from "../../src/uncertainty/uncertaintyReductionPlan.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import {
  createDefaultUncertaintyDimensions,
  uncertaintyRouterResultSchemaVersion,
  uncertaintyRouterResultSchema,
  uncertaintyProfileSchema,
  type ImpactLevel,
  type Reducibility,
  type UncertaintyDimension,
  type UncertaintyDimensionsRecord
} from "../../src/uncertainty/index.js";
import {
  combineDimensionScores,
  deriveOverallImpact,
  deriveOverallLevel,
  deriveOverallReducibility,
  scoreToLevel,
  topDriversFromDimensions
} from "../../src/uncertainty/uncertaintyScoring.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-router-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const writeAction = async (
  cwd: string,
  fixture: unknown,
  filename = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, filename);

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
};

const profileFromSignals = (input: BuildUncertaintyProfileInput) =>
  buildUncertaintyProfile(input);

const profileWithDrivers = (
  entries: Array<{
    dimension: UncertaintyDimension;
    drivers: string[];
    score?: number;
    impact?: ImpactLevel;
    reducibility?: Reducibility;
    missingEvidence?: string[];
  }>
) => {
  const dimensions: UncertaintyDimensionsRecord =
    createDefaultUncertaintyDimensions();

  for (const entry of entries) {
    const score = entry.score ?? 0.7;
    dimensions[entry.dimension] = {
      ...dimensions[entry.dimension],
      score,
      level: scoreToLevel(score),
      impact: entry.impact ?? "high",
      reducibility: entry.reducibility ?? "reducible",
      drivers: entry.drivers,
      missingEvidence: entry.missingEvidence ?? []
    };
  }

  const overallScore = combineDimensionScores(dimensions);
  const uncertaintyReductionPlan = buildUncertaintyReductionPlan(dimensions);

  return uncertaintyProfileSchema.parse({
    schemaVersion: "uncertainty-profile.v1",
    overallScore,
    overallLevel: deriveOverallLevel(overallScore),
    impact: deriveOverallImpact(dimensions),
    reducibility: deriveOverallReducibility(dimensions),
    topDrivers: topDriversFromDimensions(dimensions),
    dimensions,
    ...(uncertaintyReductionPlan !== undefined
      ? { uncertaintyReductionPlan }
      : {})
  });
};

const recommendedDecision = (
  profile: ReturnType<typeof buildUncertaintyProfile>
) => routeUncertainty(profile).recommendedDecision;

describe("routeUncertainty", () => {
  it("uses a stable router result schema version", () => {
    const result = routeUncertainty(buildUncertaintyProfile());

    expect(uncertaintyRouterResultSchemaVersion).toBe(
      "uncertainty-router-result.v1"
    );
    expect(uncertaintyRouterResultSchema.parse(result)).toEqual(result);
  });

  it("recommends PROCEED for a low/default profile", () => {
    const result = routeUncertainty(buildUncertaintyProfile());

    expect(result).toMatchObject({
      recommendedDecision: "PROCEED",
      confidence: "high",
      rationale: ["low_uncertainty_no_missing_evidence"],
      drivers: [],
      reductionPlanAvailable: false
    });
  });

  it("recommends DEFER for target file context and freshness uncertainty", () => {
    expect(
      recommendedDecision(
        profileFromSignals({
          signals: {
            targetFileReadRecently: false
          }
        })
      )
    ).toBe("DEFER");
    expect(
      recommendedDecision(
        profileFromSignals({
          signals: {
            targetFileFreshness: "unknown"
          }
        })
      )
    ).toBe("DEFER");
    expect(
      recommendedDecision(
        profileFromSignals({
          signals: {
            targetFileFreshness: "stale",
            fileChangedSinceRead: true
          }
        })
      )
    ).toBe("DEFER");
  });

  it("recommends DEFER for related tests and validation uncertainty with plans", () => {
    const relatedTests = routeUncertainty(
      profileFromSignals({
        signals: {
          relatedTestsFound: true,
          relatedTestsRead: false
        }
      })
    );
    const validationMissing = routeUncertainty(
      profileFromSignals({
        signals: {
          validationRequired: true,
          validationStatus: "not_run"
        }
      })
    );
    const validationStale = routeUncertainty(
      profileFromSignals({
        signals: {
          validationStatus: "stale"
        }
      })
    );

    expect(relatedTests.recommendedDecision).toBe("DEFER");
    expect(relatedTests.deferDrivers).toContain("related_tests_not_observed");
    expect(validationMissing.recommendedDecision).toBe("DEFER");
    expect(validationMissing.deferDrivers).toContain("validation_missing");
    expect(validationStale.recommendedDecision).toBe("DEFER");
    expect(validationStale.deferDrivers).toContain("validation_stale");
  });

  it("does not recommend ordinary PROCEED for failed validation", () => {
    const result = routeUncertainty(
      profileFromSignals({
        signals: {
          validationRequired: true,
          validationStatus: "failed"
        }
      })
    );

    expect(result.recommendedDecision).toBe("ESCALATE");
    expect(result.escalationDrivers).toContain("validation_failed");
  });

  it("recommends DEFER for command classification uncertainty", () => {
    const unknown = routeUncertainty(
      profileFromSignals({
        signals: {
          commandRiskScore: "unknown"
        }
      })
    );
    const packageScript = routeUncertainty(
      profileFromSignals({
        signals: {
          commandRiskScore: "medium",
          commandCategory: "local_write",
          networkExposure: true
        }
      })
    );

    expect(unknown.recommendedDecision).toBe("DEFER");
    expect(unknown.deferDrivers).toContain("command_classification_unknown");
    expect(packageScript.recommendedDecision).toBe("DEFER");
    expect(packageScript.deferDrivers).toContain("package_script_unknown");
  });

  it("routes command risk high to ESCALATE and command risk critical to BLOCK", () => {
    const high = routeUncertainty(
      profileFromSignals({
        signals: {
          commandRiskScore: "high"
        }
      })
    );
    const critical = routeUncertainty(
      profileFromSignals({
        signals: {
          commandRiskScore: "critical"
        }
      })
    );

    expect(high.recommendedDecision).toBe("ESCALATE");
    expect(high.escalationDrivers).toContain("command_risk_high");
    expect(critical.recommendedDecision).toBe("BLOCK");
    expect(critical.blockingDrivers).toContain("command_risk_critical");
  });

  it("routes sensitive surfaces to ESCALATE and secret drivers to BLOCK", () => {
    const sensitive = routeUncertainty(
      profileFromSignals({
        signals: {
          pathSensitivity: "high"
        }
      })
    );
    const secret = routeUncertainty(
      profileFromSignals({
        signals: {
          secretPathMatch: true,
          secretPatternMatch: true,
          secretTouch: "confirmed"
        }
      })
    );

    expect(sensitive.recommendedDecision).toBe("ESCALATE");
    expect(sensitive.escalationDrivers).toContain("sensitive_path_detected");
    expect(secret.recommendedDecision).toBe("BLOCK");
    expect(secret.blockingDrivers).toEqual(
      expect.arrayContaining([
        "secret_material_detected",
        "secret_path_detected",
        "secret_pattern_detected"
      ])
    );
  });

  it("routes workspace boundary signals conservatively", () => {
    const unknown = routeUncertainty(
      profileFromSignals({
        signals: {
          workspaceBoundaryStatus: "unknown"
        }
      })
    );
    const violation = routeUncertainty(
      profileFromSignals({
        signals: {
          workspaceBoundaryViolation: true
        }
      })
    );

    expect(unknown.recommendedDecision).toBe("DEFER");
    expect(unknown.deferDrivers).toContain("workspace_boundary_unknown");
    expect(violation.recommendedDecision).toBe("BLOCK");
    expect(violation.blockingDrivers).toContain("workspace_boundary_violation");
  });

  it("routes git workflow risk with escalation and block precedence", () => {
    const protectedBranch = routeUncertainty(
      profileFromSignals({
        signals: {
          protectedBranch: true,
          directMainlinePush: true
        }
      })
    );
    const forceAndHook = routeUncertainty(
      profileFromSignals({
        signals: {
          forcePush: true,
          hookBypass: true
        }
      })
    );

    expect(protectedBranch.recommendedDecision).toBe("ESCALATE");
    expect(protectedBranch.escalationDrivers).toEqual(
      expect.arrayContaining(["direct_mainline_risk", "protected_branch_risk"])
    );
    expect(forceAndHook.recommendedDecision).toBe("BLOCK");
    expect(forceAndHook.blockingDrivers).toEqual(
      expect.arrayContaining(["force_push_detected", "hook_bypass_detected"])
    );
  });

  it("routes environment uncertainty, ambiguous deploys, and production conservatively", () => {
    const unknown = routeUncertainty(
      profileFromSignals({
        signals: {
          environmentClassification: "unknown"
        }
      })
    );
    const ambiguousDeploy = routeUncertainty(
      profileFromSignals({
        signals: {
          landingActionType: "deploy",
          environmentClassification: "unknown",
          deploymentRisk: "high"
        }
      })
    );
    const production = routeUncertainty(
      profileFromSignals({
        signals: {
          environmentClassification: "production"
        }
      })
    );

    expect(unknown.recommendedDecision).toBe("DEFER");
    expect(unknown.deferDrivers).toContain("environment_unknown");
    expect(ambiguousDeploy.recommendedDecision).toBe("ESCALATE");
    expect(ambiguousDeploy.deferDrivers).toContain("deploy_target_ambiguous");
    expect(ambiguousDeploy.escalationDrivers).toContain(
      "environment_risk_high"
    );
    expect(production.recommendedDecision).toBe("BLOCK");
    expect(production.blockingDrivers).toContain(
      "production_environment_detected"
    );
  });

  it("routes recovery, autonomy, and provenance drivers", () => {
    const recovery = routeUncertainty(
      profileFromSignals({
        signals: {
          destructiveOperation: true
        }
      })
    );
    const retryBudget = routeUncertainty(
      profileWithDrivers([
        {
          dimension: "autonomy_budget",
          drivers: ["retry_budget_exceeded"],
          score: 0.8,
          impact: "medium",
          reducibility: "reducible"
        }
      ])
    );
    const provenance = routeUncertainty(
      profileFromSignals({
        signals: {
          delegationProvenance: "unknown"
        }
      })
    );

    expect(recovery.recommendedDecision).toBe("DEFER");
    expect(recovery.deferDrivers).toEqual(
      expect.arrayContaining([
        "destructive_operation_recovery_unknown",
        "recovery_state_unknown"
      ])
    );
    expect(retryBudget.recommendedDecision).toBe("ESCALATE");
    expect(retryBudget.recommendedDecision).not.toBe("PROCEED");
    expect(provenance.recommendedDecision).toBe("DEFER");
    expect(provenance.deferDrivers).toContain("provenance_unknown");
  });

  it("does not treat human-review-only plans as ordinary DEFER", () => {
    const result = routeUncertainty(
      profileWithDrivers([
        {
          dimension: "autonomy_budget",
          drivers: ["retry_budget_exceeded"],
          score: 0.8,
          impact: "medium",
          reducibility: "reducible"
        }
      ])
    );

    expect(result.reductionPlanAvailable).toBe(true);
    expect(result.recommendedDecision).toBe("ESCALATE");
    expect(result.recommendedDecision).not.toBe("DEFER");
    expect(result.rationale).toContain("human_review_step_present");
  });

  it("applies BLOCK precedence over ESCALATE and DEFER", () => {
    const result = routeUncertainty(
      profileWithDrivers([
        {
          dimension: "command",
          drivers: ["command_risk_critical"],
          score: 0.85,
          impact: "critical",
          reducibility: "partially_reducible"
        },
        {
          dimension: "context",
          drivers: ["target_file_not_observed"],
          score: 0.65,
          impact: "medium",
          reducibility: "reducible",
          missingEvidence: ["target_file_observed"]
        },
        {
          dimension: "sensitivity",
          drivers: ["sensitive_path_detected"],
          score: 0.6,
          impact: "high",
          reducibility: "partially_reducible"
        }
      ])
    );

    expect(result.recommendedDecision).toBe("BLOCK");
    expect(result.rationale).toContain("hard_block_driver_present");
  });

  it("applies ESCALATE precedence over ordinary DEFER", () => {
    const result = routeUncertainty(
      profileFromSignals({
        signals: {
          commandRiskScore: "high",
          targetFileReadRecently: false
        }
      })
    );

    expect(result.recommendedDecision).toBe("ESCALATE");
    expect(result.deferDrivers).toContain("target_file_not_observed");
    expect(result.escalationDrivers).toContain("command_risk_high");
  });

  it("uses DEFER for reducible uncertainty with ordinary evidence-gathering steps", () => {
    const result = routeUncertainty(
      profileFromSignals({
        signals: {
          targetFileReadRecently: false,
          validationRequired: true,
          validationStatus: "not_run"
        }
      })
    );

    expect(result.recommendedDecision).toBe("DEFER");
    expect(result.rationale).toContain(
      "reducible_uncertainty_with_reduction_plan"
    );
  });

  it("keeps PROCEED limited to low profiles without missing evidence", () => {
    const defaultResult = routeUncertainty(buildUncertaintyProfile());
    const uncertainResult = routeUncertainty(
      profileFromSignals({
        signals: {
          targetFileFreshness: "unknown"
        }
      })
    );

    expect(defaultResult.recommendedDecision).toBe("PROCEED");
    expect(uncertainResult.recommendedDecision).not.toBe("PROCEED");
  });

  it("is deterministic and does not mutate the profile", () => {
    const profile = profileFromSignals({
      signals: {
        targetFileReadRecently: false,
        validationRequired: true,
        validationStatus: "not_run"
      }
    });
    const before = JSON.stringify(profile);
    const first = routeUncertainty(profile);
    const second = routeUncertainty(profile);

    expect(second).toEqual(first);
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("uses privacy-safe router rationale and category IDs", () => {
    const result = routeUncertainty(
      profileFromSignals({
        signals: {
          targetFileReadRecently: false,
          commandRiskScore: "unknown"
        }
      })
    );

    for (const value of [
      ...result.rationale,
      ...result.drivers,
      ...result.blockingDrivers,
      ...result.deferDrivers,
      ...result.escalationDrivers
    ]) {
      expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("does not serialize raw sensitive strings in router results", () => {
    const rawStrings = [
      "/tmp/private/project/src/auth.ts",
      "/Users/example/private-repo/src/auth.ts",
      "C:\\Users\\example\\private-repo\\src\\auth.ts",
      "src/auth/login.ts",
      "npm run deploy -- --token secret",
      "rm -rf .",
      "API_KEY=secret-value",
      "super-secret-token",
      "private-repo-name",
      "main",
      "production",
      "diff --git a/src/auth.ts b/src/auth.ts",
      "validation log: secret token appeared here"
    ];
    const profile = buildUncertaintyProfile({
      signals: {
        commandRiskScore: "critical",
        commandRiskReason: "rm -rf .",
        pathSensitivity: "critical",
        pathSensitivityReason: "/Users/example/private-repo/src/auth.ts",
        matchedSensitivePath: "src/auth/login.ts",
        secretPathMatch: true,
        secretPatternMatch: true,
        secretTouch: "confirmed",
        secretDetectionReason: "API_KEY=secret-value",
        workspaceBoundaryViolation: true,
        workspaceBoundaryReason: "/tmp/private/project/src/auth.ts",
        branchRisk: "critical",
        currentBranch: "main",
        environmentClassification: "production",
        landingReason: "npm run deploy -- --token secret",
        validationReason: "validation log: secret token appeared here",
        gitWorkflowReason: "private-repo-name",
        readBeforeWriteReason: "diff --git a/src/auth.ts b/src/auth.ts",
        promptContextContainsSecret: true
      }
    });
    const serialized = JSON.stringify(routeUncertainty(profile));

    for (const raw of rawStrings.filter(
      (value) => value !== "main" && value !== "production"
    )) {
      expect(serialized).not.toContain(raw);
    }

    expect(serialized).not.toContain('"main"');
    expect(serialized).not.toContain('"production"');
    expect(serialized).toContain("hard_block_driver_present");
    expect(serialized).toContain("command_risk_critical");
    expect(serialized).toContain("workspace_boundary_violation");
    expect(serialized).toContain("production_environment_detected");
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
