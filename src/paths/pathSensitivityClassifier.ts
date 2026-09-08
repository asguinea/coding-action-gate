import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { CodingActionGatePolicy } from "../domain/policies.js";
import {
  pathPatternMatches,
  normalizePathForSensitivity
} from "./pathPatternMatching.js";
import type {
  PathSensitivityClassification,
  SensitivePathMatch,
  SensitivePathPatternLevel
} from "./pathSensitivityTypes.js";

export const defaultSensitivePathPatterns: Record<
  SensitivePathPatternLevel,
  string[]
> = {
  critical: [
    ".env",
    ".env.*",
    ".ssh/**",
    ".aws/**",
    ".gcloud/**",
    ".azure/**",
    "secrets/**",
    "*.pem",
    "*.key"
  ],
  high: [
    "auth/**",
    "authorization/**",
    "billing/**",
    "payments/**",
    "security/**",
    "infra/prod/**",
    "db/migrations/**",
    ".github/workflows/**",
    "compliance/**"
  ],
  medium: [
    "config/**",
    "infra/**",
    "scripts/deploy/**",
    "deployment/**",
    "ci/**"
  ]
};

const sensitivityRank: Record<
  PathSensitivityClassification["pathSensitivity"],
  number
> = {
  unknown: -1,
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

const orderedLevels: SensitivePathPatternLevel[] = [
  "critical",
  "high",
  "medium"
];

const unique = (values: string[]): string[] => Array.from(new Set(values));

const hasStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const collectClassifiablePaths = (
  action: NormalizedCodingActionGateAction
): string[] => {
  const candidates: string[] = [];
  const normalized = action.normalized;

  if (normalized.relativeTargetPath !== undefined) {
    candidates.push(normalized.relativeTargetPath);
  }

  if (normalized.relativeTargetPaths !== undefined) {
    candidates.push(...normalized.relativeTargetPaths);
  }

  if (normalized.targetPath !== undefined) {
    candidates.push(normalized.targetPath);
  }

  if (normalized.targetPaths !== undefined) {
    candidates.push(...normalized.targetPaths);
  }

  if ("targetPath" in action && typeof action.targetPath === "string") {
    candidates.push(action.targetPath);
  }

  if ("targetPaths" in action && hasStringArray(action.targetPaths)) {
    candidates.push(...action.targetPaths);
  }

  return unique(
    candidates
      .filter((pathValue) => pathValue.trim().length > 0)
      .map((pathValue) => normalizePathForSensitivity(pathValue))
  );
};

const patternsFromPolicy = (
  policy: CodingActionGatePolicy
): Record<SensitivePathPatternLevel, string[]> => ({
  critical:
    policy.sensitivePaths?.critical ?? defaultSensitivePathPatterns.critical,
  high: policy.sensitivePaths?.high ?? defaultSensitivePathPatterns.high,
  medium: policy.sensitivePaths?.medium ?? defaultSensitivePathPatterns.medium
});

const classifyMatches = (
  paths: string[],
  policy: CodingActionGatePolicy
): SensitivePathMatch[] => {
  const patternsByLevel = patternsFromPolicy(policy);
  const matches: SensitivePathMatch[] = [];

  for (const level of orderedLevels) {
    for (const pattern of patternsByLevel[level]) {
      for (const pathValue of paths) {
        if (pathPatternMatches(pathValue, pattern)) {
          matches.push({
            path: pathValue,
            pattern,
            level
          });
        }
      }
    }
  }

  return matches;
};

export const classifyPathSensitivity = (
  action: NormalizedCodingActionGateAction,
  policy: CodingActionGatePolicy
): PathSensitivityClassification => {
  const paths = collectClassifiablePaths(action);

  if (paths.length === 0) {
    return {
      pathSensitivity: "unknown",
      pathSensitivityReason:
        "No target paths were available for classification."
    };
  }

  const matches = classifyMatches(paths, policy);

  if (matches.length === 0) {
    return {
      pathSensitivity: "low",
      pathSensitivityReason: "No sensitive path patterns matched."
    };
  }

  const strongestMatch = matches.reduce((strongest, candidate) =>
    sensitivityRank[candidate.level] > sensitivityRank[strongest.level]
      ? candidate
      : strongest
  );

  return {
    pathSensitivity: strongestMatch.level,
    pathSensitivityReason: `Path matched ${strongestMatch.level} sensitive pattern ${strongestMatch.pattern}.`,
    matchedSensitivePath: strongestMatch.path,
    matchedSensitivePathLevel: strongestMatch.level,
    sensitivePathMatches: matches
  };
};
