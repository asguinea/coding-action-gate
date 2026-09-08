import type { StepHarborSignals } from "../domain/signals.js";

export type PathSensitivityLevel = Exclude<
  NonNullable<StepHarborSignals["pathSensitivity"]>,
  "unknown"
>;

export type SensitivePathPatternLevel = "medium" | "high" | "critical";

export interface SensitivePathMatch {
  path: string;
  pattern: string;
  level: SensitivePathPatternLevel;
}

export interface PathSensitivityClassification {
  pathSensitivity: NonNullable<StepHarborSignals["pathSensitivity"]>;
  pathSensitivityReason?: string;
  matchedSensitivePath?: string;
  matchedSensitivePathLevel?: SensitivePathPatternLevel;
  sensitivePathMatches?: SensitivePathMatch[];
}
