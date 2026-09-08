import { signalSummaryForRecord } from "./decisionFormatters.js";
import type {
  UiAuditRecord,
  UiStatusRow,
  UiValidationRecord
} from "./types.js";

type StatusSeverity = NonNullable<UiStatusRow["severity"]>;

const stringValue = (value: unknown): string | undefined =>
  value === undefined ? undefined : String(value);

const row = (
  label: string,
  value: unknown,
  severity?: StatusSeverity
): UiStatusRow | null =>
  value === undefined
    ? null
    : {
        label,
        value: Array.isArray(value) ? value.join(", ") : String(value),
        ...(severity !== undefined ? { severity } : {})
      };

const compactRows = (rows: Array<UiStatusRow | null>): UiStatusRow[] =>
  rows.filter((entry): entry is UiStatusRow => entry !== null);

export const getStatusSeverity = (value: unknown): StatusSeverity => {
  switch (value) {
    case "low":
    case "passed":
    case false:
      return "low";
    case "medium":
    case "not_run":
    case "stale":
      return "medium";
    case "high":
      return "high";
    case "critical":
    case "failed":
    case true:
      return "critical";
    case "unknown":
      return "unknown";
    default:
      return "neutral";
  }
};

export const hasGitSignals = (record: UiAuditRecord): boolean => {
  const signals = signalSummaryForRecord(record);

  return [
    "currentBranch",
    "protectedBranch",
    "upstreamBranch",
    "remoteTarget",
    "branchRisk",
    "isDetachedHead",
    "isDirtyWorktree",
    "hasUncommittedChanges",
    "hasUntrackedFiles",
    "repoIntegrityStatus",
    "gitCommandCategory",
    "directMainlineCommit",
    "directMainlinePush",
    "forcePush",
    "hookBypass"
  ].some((key) => signals[key] !== undefined);
};

export const buildGitStatusRows = (record: UiAuditRecord): UiStatusRow[] => {
  const signals = signalSummaryForRecord(record);

  return compactRows([
    row("Current branch", signals["currentBranch"]),
    row(
      "Protected branch",
      signals["protectedBranch"],
      getStatusSeverity(signals["protectedBranch"])
    ),
    row("Upstream branch", signals["upstreamBranch"]),
    row("Remote target", signals["remoteTarget"]),
    row(
      "Branch risk",
      signals["branchRisk"],
      getStatusSeverity(signals["branchRisk"])
    ),
    row(
      "Detached HEAD",
      signals["isDetachedHead"],
      getStatusSeverity(signals["isDetachedHead"])
    ),
    row(
      "Dirty worktree",
      signals["isDirtyWorktree"],
      getStatusSeverity(signals["isDirtyWorktree"])
    ),
    row(
      "Uncommitted changes",
      signals["hasUncommittedChanges"],
      getStatusSeverity(signals["hasUncommittedChanges"])
    ),
    row(
      "Untracked files",
      signals["hasUntrackedFiles"],
      getStatusSeverity(signals["hasUntrackedFiles"])
    ),
    row(
      "Repo integrity",
      signals["repoIntegrityStatus"],
      getStatusSeverity(signals["repoIntegrityStatus"])
    ),
    row("Git command", signals["gitCommandCategory"]),
    row(
      "Direct mainline commit",
      signals["directMainlineCommit"],
      getStatusSeverity(signals["directMainlineCommit"])
    ),
    row(
      "Direct mainline push",
      signals["directMainlinePush"],
      getStatusSeverity(signals["directMainlinePush"])
    ),
    row(
      "Force push",
      signals["forcePush"],
      getStatusSeverity(signals["forcePush"])
    ),
    row(
      "Hook bypass",
      signals["hookBypass"],
      getStatusSeverity(signals["hookBypass"])
    )
  ]);
};

export const hasValidationSignals = (record: UiAuditRecord): boolean => {
  const signals = signalSummaryForRecord(record);

  return [
    "validationRequired",
    "validationStatus",
    "validationScope",
    "requiredValidationCommands",
    "latestValidationCommand",
    "latestValidationKind",
    "latestValidationExitCode",
    "validationAge",
    "validationPolicyMatch",
    "validationReason"
  ].some((key) => signals[key] !== undefined);
};

export const buildValidationStatusRows = (
  record: UiAuditRecord
): UiStatusRow[] => {
  const signals = signalSummaryForRecord(record);

  return compactRows([
    row(
      "Required",
      signals["validationRequired"],
      getStatusSeverity(signals["validationRequired"])
    ),
    row(
      "Status",
      signals["validationStatus"],
      getStatusSeverity(signals["validationStatus"])
    ),
    row("Scope", signals["validationScope"]),
    row("Required commands", signals["requiredValidationCommands"]),
    row("Latest command", signals["latestValidationCommand"]),
    row("Latest kind", signals["latestValidationKind"]),
    row(
      "Latest exit code",
      signals["latestValidationExitCode"],
      Number(signals["latestValidationExitCode"]) === 0
        ? "low"
        : signals["latestValidationExitCode"] === undefined
          ? undefined
          : "critical"
    ),
    row("Validation age", signals["validationAge"]),
    row("Policy match", signals["validationPolicyMatch"]),
    row("Reason", signals["validationReason"])
  ]);
};

export const summarizeValidationRecords = (
  records: UiValidationRecord[]
): UiStatusRow[] =>
  records.map((record) => ({
    label: `${record.kind ?? "validation"}: ${record.command ?? "unknown command"}`,
    value: `${record.status ?? "unknown"} (exit ${record.exitCode ?? "unknown"}) · ${record.completedAt ?? "unknown completion time"}`,
    severity: getStatusSeverity(record.status)
  }));

export const hasLandingSignals = (record: UiAuditRecord): boolean => {
  const signals = signalSummaryForRecord(record);

  return [
    "landingAction",
    "landingActionType",
    "landingRisk",
    "landingReason",
    "requiresValidation",
    "requiresCleanWorktree",
    "requiresHumanApproval",
    "deploymentRisk",
    "releaseRisk",
    "environmentClassification"
  ].some((key) => signals[key] !== undefined);
};

export const buildLandingRiskRows = (record: UiAuditRecord): UiStatusRow[] => {
  const signals = signalSummaryForRecord(record);

  return compactRows([
    row(
      "Landing action",
      signals["landingAction"],
      getStatusSeverity(signals["landingAction"])
    ),
    row("Landing type", signals["landingActionType"]),
    row(
      "Landing risk",
      signals["landingRisk"],
      getStatusSeverity(signals["landingRisk"])
    ),
    row("Landing reason", signals["landingReason"]),
    row(
      "Requires validation",
      signals["requiresValidation"],
      getStatusSeverity(signals["requiresValidation"])
    ),
    row(
      "Requires clean worktree",
      signals["requiresCleanWorktree"],
      getStatusSeverity(signals["requiresCleanWorktree"])
    ),
    row(
      "Requires human approval",
      signals["requiresHumanApproval"],
      getStatusSeverity(signals["requiresHumanApproval"])
    ),
    row(
      "Deployment risk",
      signals["deploymentRisk"],
      getStatusSeverity(signals["deploymentRisk"])
    ),
    row(
      "Release risk",
      signals["releaseRisk"],
      getStatusSeverity(signals["releaseRisk"])
    ),
    row("Environment", stringValue(signals["environmentClassification"]))
  ]);
};
