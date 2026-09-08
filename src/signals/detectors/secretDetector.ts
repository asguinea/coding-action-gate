import type { NormalizedCodingActionGateAction } from "../../actions/actionErrors.js";
import type { CodingActionGateSignals } from "../../domain/signals.js";
import { collectClassifiablePaths } from "../../paths/pathSensitivityClassifier.js";
import { normalizePathForSensitivity } from "../../paths/pathPatternMatching.js";
import { classifySecretPath } from "../../secrets/secretPathClassifier.js";
import { detectSecretPatternsAndEntropy } from "../../secrets/secretPatterns.js";
import type {
  SecretPathFinding,
  SecretScanSource,
  SecretTouch
} from "../../secrets/secretTypes.js";
import type { SafetySignalDetector } from "./baseDetector.js";

const touchRank: Record<SecretTouch, number> = {
  unknown: -1,
  none: 0,
  possible: 1,
  probable: 2,
  confirmed: 3
};

const fileMutationActionTypes = new Set<
  NormalizedCodingActionGateAction["type"]
>(["write_file", "edit_file", "delete_file"]);

const commandActionTypes = new Set<NormalizedCodingActionGateAction["type"]>([
  "run_command",
  "git_command",
  "validation_command"
]);

const secretEnvReferencePattern =
  /\$[A-Za-z_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Za-z0-9_]*/i;

const printenvPattern = /(?:^|\s)(?:printenv|env)(?:\s|$)/i;

const strongestTouch = (values: SecretTouch[]): SecretTouch =>
  values.reduce((strongest, candidate) =>
    touchRank[candidate] > touchRank[strongest] ? candidate : strongest
  );

const confidenceForPathAction = (
  actionType: NormalizedCodingActionGateAction["type"],
  finding: SecretPathFinding
): SecretTouch => {
  if (finding.confidence === "possible") {
    return "possible";
  }

  if (actionType === "read_file") {
    return "confirmed";
  }

  if (fileMutationActionTypes.has(actionType)) {
    return "probable";
  }

  return finding.confidence;
};

const collectCommandPathCandidates = (
  action: NormalizedCodingActionGateAction
): string[] => {
  if (!commandActionTypes.has(action.type)) {
    return [];
  }

  const tokens = action.normalized.commandTokens ?? [];

  return tokens
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .filter((token) => token.length > 0)
    .map((token) => normalizePathForSensitivity(token));
};

const addRawStrings = (sources: SecretScanSource[], raw: unknown): void => {
  if (typeof raw === "string") {
    sources.push({
      kind: "raw",
      value: raw
    });
    return;
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return;
  }

  for (const value of Object.values(raw)) {
    if (typeof value === "string") {
      sources.push({
        kind: "raw",
        value
      });
    }
  }
};

const collectScanSources = (
  action: NormalizedCodingActionGateAction
): SecretScanSource[] => {
  const sources: SecretScanSource[] = [];

  if ("command" in action && typeof action.command === "string") {
    sources.push({
      kind: "command",
      value: action.command
    });
  }

  if (action.normalized.command !== undefined) {
    sources.push({
      kind: "normalized_command",
      value: action.normalized.command
    });
  }

  if ("diff" in action && typeof action.diff === "string") {
    sources.push({
      kind: "diff",
      value: action.diff
    });
  }

  if ("content" in action && typeof action.content === "string") {
    sources.push({
      kind: "content",
      value: action.content
    });
  }

  addRawStrings(sources, action.raw);

  return sources;
};

export const secretDetector: SafetySignalDetector = {
  id: "secret-detector",
  compute: ({ action }): CodingActionGateSignals => {
    const touchValues: SecretTouch[] = ["none"];
    const matchedPatternNames = new Set<string>();
    let secretPathMatch = false;
    let secretPatternMatch = false;
    let entropyAnomaly = false;
    let commandContainsSecret = false;
    let diffContainsSecret = false;
    let promptContextContainsSecret = false;
    let outputRedactionRequired = false;
    let credentialFileType: string | undefined;

    for (const pathValue of collectClassifiablePaths(action)) {
      const finding = classifySecretPath(pathValue);

      if (finding === undefined) {
        continue;
      }

      secretPathMatch = true;
      credentialFileType ??= finding.credentialFileType;
      matchedPatternNames.add(finding.patternName);
      touchValues.push(confidenceForPathAction(action.type, finding));

      if (action.type === "read_file") {
        outputRedactionRequired = true;
      }
    }

    for (const pathValue of collectCommandPathCandidates(action)) {
      const finding = classifySecretPath(pathValue);

      if (finding === undefined) {
        continue;
      }

      secretPathMatch = true;
      commandContainsSecret = true;
      outputRedactionRequired = true;
      credentialFileType ??= finding.credentialFileType;
      matchedPatternNames.add(finding.patternName);
      touchValues.push(
        finding.confidence === "possible" ? "possible" : "probable"
      );
    }

    for (const source of collectScanSources(action)) {
      const { patternFindings, entropyFinding } =
        detectSecretPatternsAndEntropy(source.value);
      const sourceHasSecretPattern = patternFindings.length > 0;
      const isCommandSource =
        source.kind === "command" || source.kind === "normalized_command";
      const hasSecretEnvReference = secretEnvReferencePattern.test(
        source.value
      );
      const hasPrintenv = isCommandSource && printenvPattern.test(source.value);

      if (sourceHasSecretPattern) {
        secretPatternMatch = true;

        for (const finding of patternFindings) {
          matchedPatternNames.add(finding.patternName);
          touchValues.push(finding.confidence);
        }
      }

      if (entropyFinding !== undefined) {
        entropyAnomaly = true;
        matchedPatternNames.add("high_entropy_candidate");
        touchValues.push(entropyFinding.confidence);
      }

      if (hasSecretEnvReference) {
        secretPatternMatch = true;
        matchedPatternNames.add("secret_environment_reference");
        touchValues.push("probable");
      } else if (hasPrintenv) {
        matchedPatternNames.add("environment_dump_command");
        touchValues.push("possible");
      }

      if (isCommandSource) {
        if (
          sourceHasSecretPattern ||
          entropyFinding !== undefined ||
          hasSecretEnvReference ||
          hasPrintenv
        ) {
          commandContainsSecret = true;
          outputRedactionRequired = true;
        }
      } else if (source.kind === "diff") {
        diffContainsSecret =
          diffContainsSecret ||
          sourceHasSecretPattern ||
          entropyFinding !== undefined;
      } else if (source.kind === "raw") {
        promptContextContainsSecret =
          promptContextContainsSecret ||
          sourceHasSecretPattern ||
          entropyFinding !== undefined;
      }
    }

    const secretTouch = strongestTouch(touchValues);
    const matchedSecretPatterns = Array.from(matchedPatternNames);
    const signals: CodingActionGateSignals = {
      secretTouch,
      secretPathMatch,
      secretPatternMatch,
      entropyAnomaly,
      outputRedactionRequired,
      commandContainsSecret,
      diffContainsSecret,
      promptContextContainsSecret,
      secretDetectionReason:
        secretTouch === "none"
          ? "No secret paths or secret-like patterns were detected."
          : "Secret path or secret-like pattern detected.",
      ...(credentialFileType !== undefined ? { credentialFileType } : {}),
      ...(matchedSecretPatterns.length > 0 ? { matchedSecretPatterns } : {})
    };

    return signals;
  }
};
