import type { StepHarborPolicy } from "../domain/policies.js";

export interface DestructiveThresholds {
  largeDiffFiles: number;
  largeDiffLines: number;
  highDeletionRatio: number;
  largeOverwriteRatio: number;
  contentTruncationRatio: number;
  minimumDeletionLinesForRatio: number;
  emptyOrTinyContentLength: number;
}

export const defaultDestructiveThresholds: DestructiveThresholds = {
  largeDiffFiles: 8,
  largeDiffLines: 500,
  highDeletionRatio: 0.6,
  largeOverwriteRatio: 0.7,
  contentTruncationRatio: 0.8,
  minimumDeletionLinesForRatio: 20,
  emptyOrTinyContentLength: 8
};

export const resolveDestructiveThresholds = (
  policy: StepHarborPolicy
): DestructiveThresholds => ({
  ...defaultDestructiveThresholds,
  ...(policy.thresholds?.largeDiffFiles !== undefined
    ? { largeDiffFiles: policy.thresholds.largeDiffFiles }
    : {}),
  ...(policy.thresholds?.largeDiffLines !== undefined
    ? { largeDiffLines: policy.thresholds.largeDiffLines }
    : {})
});
