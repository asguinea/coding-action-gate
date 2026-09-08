export const realRepoTrialReviewStatuses = [
  "accepted_for_summary",
  "needs_redaction",
  "rejected_contains_private_data",
  "rejected_invalid_schema",
  "needs_operator_clarification"
] as const;

export type RealRepoTrialReviewStatus =
  (typeof realRepoTrialReviewStatuses)[number];

export const calibrationReadinessStatuses = [
  "not_ready",
  "needs_gap_analysis",
  "ready_for_internal_calibration",
  "ready_for_limited_internal_summary"
] as const;

export type CalibrationReadinessStatus =
  (typeof calibrationReadinessStatuses)[number];
