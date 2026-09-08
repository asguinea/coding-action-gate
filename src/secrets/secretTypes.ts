import type { CodingActionGateSignals } from "../domain/signals.js";

export type SecretTouch = NonNullable<CodingActionGateSignals["secretTouch"]>;

export type SecretConfidence = Exclude<SecretTouch, "none" | "unknown">;

export interface SecretPathFinding {
  patternName: string;
  credentialFileType: string;
  confidence: SecretConfidence;
}

export interface SecretPatternFinding {
  patternName: string;
  confidence: SecretConfidence;
}

export interface SecretEntropyFinding {
  confidence: "possible" | "probable";
  nearSecretLabel: boolean;
}

export interface SecretScanSource {
  kind: "command" | "diff" | "content" | "raw" | "normalized_command";
  value: string;
}
