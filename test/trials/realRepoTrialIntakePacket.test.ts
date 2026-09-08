import { describe, expect, it } from "vitest";
import {
  realRepoTrialIntakePacketContainsForbiddenRawString,
  realRepoTrialIntakePacketSchemaVersion,
  validateRealRepoTrialIntakePacket,
  type RealRepoTrialIntakePacket
} from "../../trials/real-repo/index.js";

const validPacket = (): RealRepoTrialIntakePacket => ({
  schemaVersion: "real-repo-trial-intake-packet.v1",
  packetId: "packet-placeholder",
  sourceFindingsId: "example-sanitized-placeholder",
  intakeStatus: "accepted_for_summary",
  trialMode: "guided_operator",
  repoCategory: "toy",
  repoSizeCategory: "small",
  languageCategories: ["typescript"],
  frameworkCategories: ["node"],
  stepharborVersion: "category_version_placeholder",
  privacyReview: {
    reviewed: true,
    safeToSummarize: true,
    safeForExternalSharing: false
  },
  summary: {
    decisionCounts: {
      PROCEED: 3,
      DEFER: 2,
      ESCALATE: 1,
      BLOCK: 1
    },
    outcomeCounts: {
      useful: 2,
      false_positive: 1,
      needs_review: 1
    },
    observedFamilies: [
      "missing_stale_low_quality_context",
      "sensitive_surfaces_large_diffs"
    ],
    topDriverCategories: [
      "target_file_not_observed",
      "sensitive_change_review_required"
    ]
  },
  gapAnalysisReady: true,
  limitations: ["sanitized_findings_only", "manual_review_required"]
});

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

describe("real-repo trial intake packet schema", () => {
  it("validates a category-only packet with stable schema version", () => {
    const packet = validateRealRepoTrialIntakePacket(validPacket());

    expect(packet.schemaVersion).toBe(realRepoTrialIntakePacketSchemaVersion);
    expect(packet.intakeStatus).toBe("accepted_for_summary");
    expect(packet.gapAnalysisReady).toBe(true);
  });

  it("rejects invalid status values", () => {
    expect(() =>
      validateRealRepoTrialIntakePacket({
        ...validPacket(),
        intakeStatus: "accepted"
      })
    ).toThrow();
  });

  it("rejects forbidden raw-looking strings", () => {
    const packet = validPacket();

    expect(realRepoTrialIntakePacketContainsForbiddenRawString(packet)).toBe(
      false
    );
    expect(() =>
      validateRealRepoTrialIntakePacket({
        ...packet,
        stepharborVersion: "/Users/example/private-repo"
      })
    ).toThrow(/forbidden raw-looking value/);
  });

  it("requires accepted and safe-to-summarize status before gap analysis readiness", () => {
    expect(() =>
      validateRealRepoTrialIntakePacket({
        ...validPacket(),
        intakeStatus: "needs_redaction"
      })
    ).toThrow(/not ready for gap analysis/);

    expect(() =>
      validateRealRepoTrialIntakePacket({
        ...validPacket(),
        privacyReview: {
          reviewed: true,
          safeToSummarize: false,
          safeForExternalSharing: false
        }
      })
    ).toThrow(/not ready for gap analysis/);

    expect(
      validateRealRepoTrialIntakePacket({
        ...validPacket(),
        intakeStatus: "needs_operator_clarification",
        privacyReview: {
          reviewed: true,
          safeToSummarize: false,
          safeForExternalSharing: false
        },
        gapAnalysisReady: false
      }).gapAnalysisReady
    ).toBe(false);
  });

  it("keeps validated packet output free of raw private values", () => {
    const serialized = JSON.stringify(
      validateRealRepoTrialIntakePacket(validPacket())
    );

    for (const rawString of forbiddenRawStrings) {
      expect(serialized).not.toContain(rawString);
    }
  });
});
