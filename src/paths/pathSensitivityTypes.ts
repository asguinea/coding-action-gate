import type { CodingActionGateSignals } from "../domain/signals.js";

export type PathSensitivityLevel = Exclude<
  NonNullable<CodingActionGateSignals["pathSensitivity"]>,
  "unknown"
>;

export type SensitivePathPatternLevel = "medium" | "high" | "critical";

export interface SensitivePathMatch {
  path: string;
  pattern: string;
  level: SensitivePathPatternLevel;
}

export interface PathSensitivityClassification {
  pathSensitivity: NonNullable<CodingActionGateSignals["pathSensitivity"]>;
  pathSensitivityReason?: string;
  matchedSensitivePath?: string;
  matchedSensitivePathLevel?: SensitivePathPatternLevel;
  sensitivePathMatches?: SensitivePathMatch[];
}
