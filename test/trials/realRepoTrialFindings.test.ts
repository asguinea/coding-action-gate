import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  realRepoTrialFindingsContainForbiddenRawString,
  realRepoTrialFindingsSchemaVersion,
  realRepoTrialFindingsSummarySchemaVersion,
  summarizeRealRepoTrialFindings,
  validateRealRepoTrialFindings,
  type RealRepoTrialFindings
} from "../../trials/real-repo/index.js";

const examplePath = path.join(
  process.cwd(),
  "trials",
  "real-repo",
  "example-sanitized-findings.json"
);

const loadExample = async (): Promise<RealRepoTrialFindings> =>
  validateRealRepoTrialFindings(
    JSON.parse(await readFile(examplePath, "utf8")) as unknown
  );

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const forbiddenRawStrings = [
  "/Users/",
  "C:\\",
  "/tmp/private",
  "diff --git",
  "API_KEY=",
  "SECRET=",
  "TOKEN=",
  "PRIVATE_KEY",
  "-----BEGIN",
  "http://",
  "https://",
  ".internal",
  "npm run",
  "rm -rf",
  "git push",
  "private-repo",
  "feature/customer-prod",
  "validation log:"
];

describe("real-repo trial findings", () => {
  it("parses the synthetic placeholder example with stable schema and limitation", async () => {
    const findings = await loadExample();

    expect(findings.schemaVersion).toBe(realRepoTrialFindingsSchemaVersion);
    expect(findings.trialId).toBe("example-sanitized-placeholder");
    expect(findings.limitations).toEqual(
      expect.arrayContaining(["example_placeholder_not_real_trial"])
    );
    expect(findings.privacyReview.manuallyReviewed).toBe(true);
  });

  it("requires non-negative counts and false sensitive-content privacy flags", async () => {
    const findings = await loadExample();

    expect(() =>
      validateRealRepoTrialFindings({
        ...findings,
        decisionCounts: {
          ...findings.decisionCounts,
          DEFER: -1
        }
      })
    ).toThrow();

    expect(() =>
      validateRealRepoTrialFindings({
        ...findings,
        privacyReview: {
          ...findings.privacyReview,
          containsSecrets: true
        }
      })
    ).toThrow();
  });

  it("requires known opportunity family IDs and stable driver category IDs", async () => {
    const findings = await loadExample();

    expect(
      findings.cases.map((trialCase) => trialCase.opportunityFamily)
    ).toEqual([
      "missing_stale_low_quality_context",
      "sensitive_surfaces_large_diffs",
      "dangerous_commands_boundary_escapes"
    ]);

    expect(() =>
      validateRealRepoTrialFindings({
        ...findings,
        cases: [
          {
            ...findings.cases[0],
            opportunityFamily: "unknown_family"
          }
        ]
      })
    ).toThrow();

    expect(() =>
      validateRealRepoTrialFindings({
        ...findings,
        cases: [
          {
            ...findings.cases[0],
            driverCategories: ["Raw Driver"]
          }
        ]
      })
    ).toThrow();
  });

  it("rejects forbidden raw-looking strings and keeps the example clean", async () => {
    const findings = await loadExample();
    const serialized = JSON.stringify(findings);

    for (const rawString of forbiddenRawStrings) {
      expect(serialized).not.toContain(rawString);
    }

    expect(realRepoTrialFindingsContainForbiddenRawString(findings)).toBe(
      false
    );
    expect(() =>
      validateRealRepoTrialFindings({
        ...findings,
        codingActionGateVersion: "/Users/example/private-repo"
      })
    ).toThrow(/forbidden raw-looking value/);
  });

  it("summarizes findings deterministically without mutating inputs", async () => {
    const findings = await loadExample();
    const second = validateRealRepoTrialFindings({
      ...clone(findings),
      trialId: "second-placeholder",
      decisionCounts: {
        PROCEED: 1,
        DEFER: 1,
        ESCALATE: 0,
        BLOCK: 0
      },
      privacyReview: {
        ...findings.privacyReview,
        manuallyReviewed: false
      },
      cases: [
        {
          caseId: "placeholder-validation-001",
          opportunityFamily: "skipped_absent_misleading_verification",
          expectedPosture: "DEFER",
          actualPosture: "DEFER",
          outcomeCategory: "confusing",
          driverCategories: ["validation_missing"],
          notesCategory: "validation_guidance_unclear"
        }
      ],
      limitations: ["synthetic_sanitized_data", "manual_review_required"]
    });
    const input = [findings, second];
    const before = JSON.stringify(input);
    const firstSummary = summarizeRealRepoTrialFindings(input);
    const secondSummary = summarizeRealRepoTrialFindings(input);

    expect(firstSummary.schemaVersion).toBe(
      realRepoTrialFindingsSummarySchemaVersion
    );
    expect(firstSummary).toEqual(secondSummary);
    expect(JSON.stringify(input)).toBe(before);
    expect(firstSummary.trialCount).toBe(2);
    expect(firstSummary.totalDecisionCounts).toEqual({
      PROCEED: 4,
      DEFER: 3,
      ESCALATE: 1,
      BLOCK: 1
    });
    expect(firstSummary.outcomeCounts).toMatchObject({
      useful: 2,
      needs_review: 1,
      confusing: 1
    });
    expect(firstSummary.opportunityFamilyCounts).toMatchObject({
      missing_stale_low_quality_context: 1,
      sensitive_surfaces_large_diffs: 1,
      dangerous_commands_boundary_escapes: 1,
      skipped_absent_misleading_verification: 1
    });
    expect(firstSummary.topDriverCounts).toMatchObject({
      target_file_not_observed: 3,
      validation_missing: 3,
      sensitive_change_review_required: 3,
      command_risk_critical: 3
    });
    expect(firstSummary.privacyReview).toEqual({
      allManuallyReviewed: false,
      unsafeFindingCount: 0
    });
    expect(JSON.stringify(firstSummary)).not.toContain("/Users/");
    expect(firstSummary.limitations).toEqual(
      expect.arrayContaining([
        "sanitized_category_level_findings",
        "manual_review_required",
        "not_real_world_validation_claim",
        "no_automatic_collection"
      ])
    );
  });
});
