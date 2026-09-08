import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { CodingActionGatePolicy } from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import {
  resolveDestructiveThresholds,
  type DestructiveThresholds
} from "./destructiveThresholds.js";

type DestructiveSeverity = NonNullable<
  CodingActionGateSignals["destructiveSeverity"]
>;

interface DestructiveFinding {
  subtype: string;
  severity: DestructiveSeverity;
  score: number;
  reason: string;
}

const severityRank: Record<DestructiveSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
  unknown: -1
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNumericMetadata = (
  action: NormalizedCodingActionGateAction,
  key: string
): number | undefined => {
  const directValue = (action as unknown as Record<string, unknown>)[key];

  if (typeof directValue === "number") {
    return directValue;
  }

  if (isRecord(action.raw) && typeof action.raw[key] === "number") {
    return action.raw[key];
  }

  return undefined;
};

const targetPathCount = (action: NormalizedCodingActionGateAction): number => {
  const counts = [
    action.normalized.targetPaths?.length,
    action.normalized.absoluteTargetPaths?.length,
    action.normalized.relativeTargetPaths?.length
  ].filter((value): value is number => value !== undefined);

  return counts.length > 0 ? Math.max(...counts) : 0;
};

const chooseMostSevereFinding = (
  findings: DestructiveFinding[]
): DestructiveFinding | undefined => {
  if (findings.length === 0) {
    return undefined;
  }

  const strongest = findings.reduce((current, candidate) => {
    if (candidate.score > current.score) {
      return candidate;
    }

    if (
      candidate.score === current.score &&
      severityRank[candidate.severity] > severityRank[current.severity]
    ) {
      return candidate;
    }

    return current;
  });

  if (findings.length >= 2 && strongest.score >= 0.75) {
    return {
      ...strongest,
      severity: "critical",
      score: 0.9,
      reason: `${strongest.reason} Multiple destructive indicators were detected.`
    };
  }

  return strongest;
};

const findingToSignals = (
  finding: DestructiveFinding | undefined
): CodingActionGateSignals => {
  if (finding === undefined) {
    return {
      destructiveOperation: false
    };
  }

  return {
    destructiveOperation: true,
    destructiveSubtype: finding.subtype,
    destructiveSeverity: finding.severity,
    destructiveReason: finding.reason,
    destructiveScore: finding.score
  };
};

const evaluateWriteFile = (
  action: Extract<NormalizedCodingActionGateAction, { type: "write_file" }>,
  thresholds: DestructiveThresholds
): DestructiveFinding[] => {
  const findings: DestructiveFinding[] = [];
  const overwriteRatio = readNumericMetadata(action, "overwriteRatio");

  if (
    typeof action.content === "string" &&
    action.content.length <= thresholds.emptyOrTinyContentLength
  ) {
    findings.push({
      subtype: "content_truncation",
      severity: "medium",
      score: 0.6,
      reason: "Write content is empty or extremely short."
    });
  }

  if (
    overwriteRatio !== undefined &&
    overwriteRatio >= thresholds.largeOverwriteRatio
  ) {
    findings.push({
      subtype: "large_overwrite",
      severity: "high",
      score: 0.75,
      reason: "Write metadata indicates a large overwrite."
    });
  }

  const truncationRatio = readNumericMetadata(action, "contentTruncationRatio");

  if (
    truncationRatio !== undefined &&
    truncationRatio >= thresholds.contentTruncationRatio
  ) {
    findings.push({
      subtype: "content_truncation",
      severity: "high",
      score: 0.75,
      reason: "Write metadata indicates content truncation."
    });
  }

  return findings;
};

const evaluateEditFile = (
  action: Extract<NormalizedCodingActionGateAction, { type: "edit_file" }>,
  thresholds: DestructiveThresholds
): DestructiveFinding[] => {
  const findings: DestructiveFinding[] = [];
  const files = action.diffStats?.files ?? targetPathCount(action);
  const addedLines = action.diffStats?.addedLines ?? 0;
  const deletedLines = action.diffStats?.deletedLines ?? 0;
  const changedLines = addedLines + deletedLines;

  if (files >= thresholds.largeDiffFiles) {
    findings.push({
      subtype: "broad_multi_file_change",
      severity: files >= thresholds.largeDiffFiles * 2 ? "high" : "medium",
      score: 0.65,
      reason: "Edit affects many files."
    });
  }

  if (deletedLines >= thresholds.largeDiffLines) {
    findings.push({
      subtype: "high_deletion_ratio",
      severity: "high",
      score: 0.7,
      reason: "Edit deletes a large number of lines."
    });
  }

  if (changedLines > 0) {
    const deletionRatio = deletedLines / changedLines;

    if (
      deletedLines >= thresholds.minimumDeletionLinesForRatio &&
      deletionRatio >= thresholds.highDeletionRatio
    ) {
      findings.push({
        subtype: "high_deletion_ratio",
        severity: deletedLines >= thresholds.largeDiffLines ? "high" : "medium",
        score: 0.7,
        reason: "Edit deletes a high proportion of changed lines."
      });
    }
  }

  const smallerSide = Math.min(addedLines, deletedLines);
  const largerSide = Math.max(addedLines, deletedLines);

  if (
    smallerSide >= thresholds.minimumDeletionLinesForRatio &&
    largerSide >= thresholds.largeDiffLines &&
    smallerSide / largerSide >= thresholds.largeOverwriteRatio
  ) {
    findings.push({
      subtype: "large_overwrite",
      severity: "high",
      score: 0.75,
      reason: "Edit replaces a large amount of content."
    });
  }

  return findings;
};

const evaluateMultiPath = (
  action: NormalizedCodingActionGateAction,
  thresholds: DestructiveThresholds
): DestructiveFinding[] => {
  const count = targetPathCount(action);

  if (count >= thresholds.largeDiffFiles) {
    return [
      {
        subtype: "broad_multi_file_change",
        severity: "medium",
        score: 0.65,
        reason: "Action targets many filesystem paths."
      }
    ];
  }

  return [];
};

export const evaluateDestructiveAction = (
  action: NormalizedCodingActionGateAction,
  policy: CodingActionGatePolicy
): CodingActionGateSignals => {
  const thresholds = resolveDestructiveThresholds(policy);

  if (action.type === "delete_file") {
    return {
      destructiveOperation: true,
      destructiveSubtype: "delete_file",
      destructiveSeverity: "high",
      destructiveReason: "File deletion is destructive.",
      destructiveScore: 0.85
    };
  }

  const findings: DestructiveFinding[] = [];

  if (action.type === "write_file") {
    findings.push(...evaluateWriteFile(action, thresholds));
  }

  if (action.type === "edit_file") {
    findings.push(...evaluateEditFile(action, thresholds));
  }

  if (action.type === "write_file" || action.type === "edit_file") {
    findings.push(...evaluateMultiPath(action, thresholds));
  }

  if (findings.length === 0) {
    return findingToSignals(undefined);
  }

  return findingToSignals(chooseMostSevereFinding(findings));
};
