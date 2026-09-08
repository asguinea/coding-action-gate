import {
  signalSummaryForRecord,
  summarizeAction
} from "./decisionFormatters.js";
import type {
  UiAffectedResources,
  UiAuditRecord,
  UiEscalationRiskEntry,
  UiEscalationValidationStatus,
  UiPolicyTraceEntry
} from "./types.js";

const stringValue = (value: unknown): string | undefined =>
  value === undefined ? undefined : String(value);

const boolValue = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const severityFromValue = (
  value: unknown
): UiEscalationRiskEntry["severity"] => {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  return "unknown";
};

export const hasEscalationReview = (record: UiAuditRecord): boolean =>
  record.decision === "ESCALATE";

export const getEscalationPolicies = (
  record: UiAuditRecord
): UiPolicyTraceEntry[] =>
  (record.policyTrace ?? []).filter(
    (entry) => entry.matched && entry.effect === "ESCALATE"
  );

export const getAffectedResources = (
  record: UiAuditRecord
): UiAffectedResources => {
  const action = summarizeAction(record);
  const signals = signalSummaryForRecord(record);
  const currentBranch = stringValue(signals["currentBranch"]);
  const remoteTarget = stringValue(signals["remoteTarget"]);

  return {
    targetPaths: action.targetPaths,
    ...(action.command !== undefined ? { command: action.command } : {}),
    ...(currentBranch !== undefined ? { currentBranch } : {}),
    ...(remoteTarget !== undefined ? { remoteTarget } : {})
  };
};

export const buildEscalationRiskSummary = (
  record: UiAuditRecord
): UiEscalationRiskEntry[] => {
  const signals = signalSummaryForRecord(record);
  const action = summarizeAction(record);
  const risks: UiEscalationRiskEntry[] = [];

  const pathSensitivity = signals["pathSensitivity"];
  if (pathSensitivity === "high" || pathSensitivity === "critical") {
    risks.push({
      label: "Sensitive path",
      value: String(pathSensitivity),
      severity: severityFromValue(pathSensitivity),
      detail: action.targetPaths.join(", ")
    });
  }

  if (signals["destructiveOperation"] === true) {
    const destructiveSeverity = signals["destructiveSeverity"];
    risks.push({
      label: "Destructive operation",
      value: "true",
      severity: severityFromValue(destructiveSeverity),
      ...(destructiveSeverity !== undefined
        ? { detail: String(destructiveSeverity) }
        : {})
    });
  }

  const commandRiskScore = signals["commandRiskScore"];
  if (commandRiskScore === "high" || commandRiskScore === "critical") {
    risks.push({
      label: "Command risk",
      value: String(commandRiskScore),
      severity: severityFromValue(commandRiskScore),
      ...(action.command !== undefined ? { detail: action.command } : {})
    });
  }

  const branchRisk = signals["branchRisk"];
  if (branchRisk === "high" || branchRisk === "critical") {
    const currentBranch = stringValue(signals["currentBranch"]);
    risks.push({
      label: "Git branch risk",
      value: String(branchRisk),
      severity: severityFromValue(branchRisk),
      ...(currentBranch !== undefined ? { detail: currentBranch } : {})
    });
  }

  if (boolValue(signals["directMainlineCommit"]) === true) {
    const currentBranch = stringValue(signals["currentBranch"]);
    risks.push({
      label: "Direct mainline commit",
      value: "true",
      severity: "high",
      ...(currentBranch !== undefined ? { detail: currentBranch } : {})
    });
  }

  if (boolValue(signals["landingAction"]) === true) {
    const landingRisk = signals["landingRisk"];
    risks.push({
      label: "Landing action",
      value: stringValue(signals["landingActionType"]) ?? "true",
      severity: severityFromValue(landingRisk),
      ...(landingRisk !== undefined
        ? { detail: `risk: ${String(landingRisk)}` }
        : {})
    });
  }

  const validationStatus = signals["validationStatus"];
  if (validationStatus !== undefined) {
    risks.push({
      label: "Validation status",
      value: String(validationStatus),
      severity: validationStatus === "failed" ? "critical" : "low",
      ...(signals["latestValidationCommand"] !== undefined
        ? { detail: String(signals["latestValidationCommand"]) }
        : {})
    });
  }

  const deploymentRisk = signals["deploymentRisk"];
  if (deploymentRisk !== undefined) {
    risks.push({
      label: "Deployment risk",
      value: String(deploymentRisk),
      severity: severityFromValue(deploymentRisk)
    });
  }

  const releaseRisk = signals["releaseRisk"];
  if (releaseRisk !== undefined) {
    risks.push({
      label: "Release risk",
      value: String(releaseRisk),
      severity: severityFromValue(releaseRisk)
    });
  }

  const secretTouch = signals["secretTouch"];
  if (secretTouch === "probable" || secretTouch === "confirmed") {
    risks.push({
      label: "Secret touch",
      value: String(secretTouch),
      severity: secretTouch === "confirmed" ? "critical" : "high"
    });
  }

  return risks;
};

export const formatValidationStatusForEscalation = (
  record: UiAuditRecord
): UiEscalationValidationStatus => {
  const signals = signalSummaryForRecord(record);
  const hasValidationSignals =
    signals["validationRequired"] !== undefined ||
    signals["validationStatus"] !== undefined ||
    signals["latestValidationCommand"] !== undefined ||
    signals["latestValidationExitCode"] !== undefined;

  if (!hasValidationSignals) {
    return {
      present: false
    };
  }

  return {
    present: true,
    ...(typeof signals["validationRequired"] === "boolean"
      ? { required: signals["validationRequired"] }
      : {}),
    ...(signals["validationStatus"] !== undefined
      ? { status: String(signals["validationStatus"]) }
      : {}),
    ...(signals["latestValidationCommand"] !== undefined
      ? { latestCommand: String(signals["latestValidationCommand"]) }
      : {}),
    ...(signals["latestValidationExitCode"] !== undefined
      ? { latestExitCode: String(signals["latestValidationExitCode"]) }
      : {})
  };
};
