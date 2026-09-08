import { describe, expect, it } from "vitest";
import {
  calibrationReadinessStatuses,
  realRepoTrialIntakeStatuses,
  realRepoTrialReviewStatuses
} from "../../trials/real-repo/index.js";

describe("real-repo trial review statuses", () => {
  it("exports review status values aligned with intake packet statuses", () => {
    expect(realRepoTrialReviewStatuses).toEqual(realRepoTrialIntakeStatuses);
    expect(realRepoTrialReviewStatuses).toEqual([
      "accepted_for_summary",
      "needs_redaction",
      "rejected_contains_private_data",
      "rejected_invalid_schema",
      "needs_operator_clarification"
    ]);
  });

  it("exports calibration readiness status values", () => {
    expect(calibrationReadinessStatuses).toEqual([
      "not_ready",
      "needs_gap_analysis",
      "ready_for_internal_calibration",
      "ready_for_limited_internal_summary"
    ]);
  });
});
