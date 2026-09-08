import { describe, expect, it } from "vitest";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";

describe("uncertainty profile privacy", () => {
  it("serializes only stable category IDs and never raw sensitive values", () => {
    const rawStrings = [
      "/tmp/private/project/src/auth.ts",
      "/Users/example/private-repo/src/auth.ts",
      "C:\\Users\\example\\private-repo\\src\\auth.ts",
      "src/auth/login.ts",
      "rm -rf .",
      "npm run deploy -- --token secret",
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
    const serialized = JSON.stringify(profile);

    for (const raw of rawStrings.filter(
      (value) => value !== "main" && value !== "production"
    )) {
      expect(serialized).not.toContain(raw);
    }

    expect(serialized).not.toContain('"main"');
    expect(serialized).not.toContain('"production"');

    expect(serialized).toContain("command_risk_critical");
    expect(serialized).toContain("sensitive_path_detected");
    expect(serialized).toContain("secret_path_detected");
    expect(serialized).toContain("workspace_boundary_violation");
    expect(serialized).toContain("production_environment_detected");
    expect(serialized).toContain("stop_and_request_human_review");

    for (const dimension of Object.values(profile.dimensions)) {
      for (const value of [
        ...dimension.drivers,
        ...dimension.evidence,
        ...dimension.missingEvidence
      ]) {
        expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }

    for (const step of profile.uncertaintyReductionPlan?.steps ?? []) {
      expect(step.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(step.kind).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(step.rationale).toMatch(/^[a-z][a-z0-9_]*$/);

      for (const value of [
        ...step.driversAddressed,
        ...step.requiredEvidence
      ]) {
        expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });
});
