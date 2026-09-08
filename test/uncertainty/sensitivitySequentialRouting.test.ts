import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-sensitive-seq-")
  );
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

describe("sensitivity sequential uncertainty routing", () => {
  it("maps sensitive surfaces to high-impact sensitivity", () => {
    const sensitive = profileFor({ pathSensitivity: "high" });
    const critical = profileFor({ pathSensitivity: "critical" });

    expect(sensitive.dimensions.sensitivity.drivers).toEqual(
      expect.arrayContaining([
        "sensitive_path_detected",
        "sensitive_surface_detected"
      ])
    );
    expect(sensitive.dimensions.sensitivity.impact).toBe("high");
    expect(critical.dimensions.sensitivity.impact).toBe("critical");
  });

  it("maps secret surfaces to critical sensitivity and advisory BLOCK", () => {
    const secretPath = profileFor({ secretPathMatch: true });
    const secretPattern = profileFor({ secretPatternMatch: true });
    const secretMaterial = profileFor({ secretTouch: "confirmed" });

    expect(secretPath.dimensions.sensitivity.drivers).toContain(
      "secret_path_detected"
    );
    expect(secretPath.dimensions.sensitivity.level).toBe("critical");
    expect(secretPattern.dimensions.sensitivity.drivers).toContain(
      "secret_pattern_detected"
    );
    expect(secretPattern.dimensions.sensitivity.impact).toBe("critical");
    expect(secretMaterial.dimensions.sensitivity.drivers).toContain(
      "secret_material_detected"
    );
    expect(routeUncertainty(secretPath).recommendedDecision).toBe("BLOCK");
    expect(routeUncertainty(secretPattern).recommendedDecision).toBe("BLOCK");
    expect(routeUncertainty(secretMaterial).recommendedDecision).toBe("BLOCK");
  });

  it("adds sensitive context missing drivers when target context is missing", () => {
    const profile = profileFor({
      pathSensitivity: "high",
      targetFileReadRecently: false
    });

    expect(profile.dimensions.sensitivity.drivers).toEqual(
      expect.arrayContaining([
        "sensitive_context_missing",
        "sensitive_surface_context_incomplete"
      ])
    );
    expect(profile.dimensions.sensitivity.missingEvidence).toContain(
      "sensitive_context_available"
    );
  });

  it("adds sensitive context available evidence when context is available", () => {
    const profile = profileFor({
      pathSensitivity: "high",
      targetFileReadRecently: true,
      relatedTestsRead: true,
      contextCompletenessScore: 0.9
    });

    expect(profile.dimensions.sensitivity.drivers).toContain(
      "sensitive_change_review_required"
    );
    expect(profile.dimensions.sensitivity.evidence).toContain(
      "sensitive_context_available"
    );
  });

  it("maps sensitive validation uncertainty and availability", () => {
    const missing = profileFor({
      pathSensitivity: "high",
      validationRequired: true,
      validationStatus: "not_run"
    });
    const available = profileFor({
      pathSensitivity: "high",
      validationRequired: true,
      validationStatus: "passed"
    });

    expect(missing.dimensions.sensitivity.drivers).toContain(
      "sensitive_validation_missing"
    );
    expect(missing.dimensions.validation.drivers).toContain(
      "validation_missing"
    );
    expect(available.dimensions.sensitivity.evidence).toContain(
      "sensitive_validation_available"
    );
  });

  it("creates evidence-gathering steps for sensitive missing context", () => {
    const kinds = stepKinds({
      pathSensitivity: "high",
      targetFileReadRecently: false,
      relatedTestsFound: true,
      relatedTestsRead: false,
      contextCompletenessScore: 0.2
    });

    expect(kinds).toEqual(
      expect.arrayContaining([
        "read_target_file",
        "inspect_related_context",
        "read_related_tests"
      ])
    );
  });

  it("uses human review for context-available sensitive changes", () => {
    const profile = profileFor({
      pathSensitivity: "high",
      targetFileReadRecently: true
    });

    expect(profile.uncertaintyReductionPlan?.steps).toEqual([
      expect.objectContaining({
        kind: "stop_and_request_human_review",
        driversAddressed: ["sensitive_change_review_required"]
      })
    ]);
    expect(profile.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "ESCALATE"
    );
  });

  it("does not produce ordinary read steps for secret surfaces", () => {
    const profile = profileFor({
      secretPathMatch: true,
      secretPatternMatch: true,
      targetFileReadRecently: false,
      contextCompletenessScore: 0.2
    });
    const kinds = profile.uncertaintyReductionPlan?.steps.map(
      (step) => step.kind
    );

    expect(kinds).toContain("stop_and_request_human_review");
    expect(kinds).not.toContain("read_target_file");
    expect(kinds).not.toContain("inspect_related_context");
    expect(kinds).not.toContain("read_related_tests");
  });

  it("includes validation steps for sensitive validation missing", () => {
    const profile = profileFor({
      pathSensitivity: "high",
      validationRequired: true,
      validationStatus: "not_run"
    });

    expect(profile.uncertaintyReductionPlan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "run_validation",
          driversAddressed: expect.arrayContaining([
            "sensitive_validation_missing",
            "validation_missing"
          ])
        })
      ])
    );
    expect(profile.uncertaintyReductionPlan?.expectedNextDecision).toBe(
      "PROCEED_OR_ESCALATE"
    );
  });

  it("recommends DEFER for sensitive surfaces with missing context or evidence", () => {
    const missingTarget = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        targetFileReadRecently: false
      })
    );
    const missingTests = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        relatedTestsFound: true,
        relatedTestsRead: false
      })
    );
    const missingValidation = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        validationRequired: true,
        validationStatus: "not_run"
      })
    );

    expect(missingTarget.recommendedDecision).toBe("DEFER");
    expect(missingTarget.rationale).toContain(
      "sensitive_context_requires_evidence"
    );
    expect(missingTarget.deferDrivers).toContain("sensitive_context_missing");
    expect(missingTests.recommendedDecision).toBe("DEFER");
    expect(missingValidation.recommendedDecision).toBe("DEFER");
  });

  it("recommends ESCALATE once sensitive context or validation evidence is available", () => {
    const contextAvailable = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        targetFileReadRecently: true,
        contextCompletenessScore: 0.9
      })
    );
    const validationAvailable = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        validationRequired: true,
        validationStatus: "passed"
      })
    );

    expect(contextAvailable.recommendedDecision).toBe("ESCALATE");
    expect(contextAvailable.escalationDrivers).toContain(
      "sensitive_change_review_required"
    );
    expect(validationAvailable.recommendedDecision).toBe("ESCALATE");
    expect(validationAvailable.escalationDrivers).toContain(
      "sensitive_path_detected"
    );
  });

  it("keeps BLOCK precedence over sensitive DEFER and ESCALATE", () => {
    const criticalCommand = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        targetFileReadRecently: false,
        commandRiskScore: "critical"
      })
    );
    const production = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        targetFileReadRecently: false,
        environmentClassification: "production"
      })
    );

    expect(criticalCommand.recommendedDecision).toBe("BLOCK");
    expect(criticalCommand.blockingDrivers).toContain("command_risk_critical");
    expect(production.recommendedDecision).toBe("BLOCK");
    expect(production.blockingDrivers).toContain(
      "production_environment_detected"
    );
  });

  it("models sequential DEFER then ESCALATE for the same sensitive surface", () => {
    const beforeEvidence = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        targetFileReadRecently: false
      })
    );
    const afterEvidence = routeUncertainty(
      profileFor({
        pathSensitivity: "high",
        targetFileReadRecently: true
      })
    );

    expect(beforeEvidence.recommendedDecision).toBe("DEFER");
    expect(afterEvidence.recommendedDecision).toBe("ESCALATE");
  });

  it("does not serialize raw sensitivity or secret values", () => {
    const rawStrings = [
      "/Users/example/private-repo/src/auth/login.ts",
      "/tmp/private/project/billing/secrets.ts",
      "C:\\Users\\example\\private-repo\\src\\security\\roles.ts",
      ".env",
      ".ssh/id_rsa",
      ".aws/credentials",
      "API_KEY=secret-value",
      "super-secret-token",
      "STRIPE_SECRET_KEY=sk_test_secret",
      "PRIVATE_KEY-----BEGIN",
      "private-repo-name",
      "customer-prod",
      "diff --git a/src/auth.ts b/src/auth.ts",
      "validation log: secret token appeared here"
    ];
    const profile = profileFor({
      pathSensitivity: "high",
      pathSensitivityReason: "/Users/example/private-repo/src/auth/login.ts",
      matchedSensitivePath: "/tmp/private/project/billing/secrets.ts",
      secretPathMatch: true,
      secretPatternMatch: true,
      secretTouch: "confirmed",
      credentialFileType: ".env",
      secretDetectionReason: "STRIPE_SECRET_KEY=sk_test_secret",
      matchedSecretPatterns: ["PRIVATE_KEY-----BEGIN"],
      currentBranch: "main",
      environmentClassification: "production",
      gitWorkflowReason: "private-repo-name",
      landingReason: "customer-prod",
      validationReason: "validation log: secret token appeared here",
      readBeforeWriteReason: "diff --git a/src/auth.ts b/src/auth.ts"
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

    expect(serializedRouter).toContain("hard_block_driver_present");
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
