import type {
  UiPolicy,
  UiPolicyRule,
  UiPolicyRuleSummary,
  UiPolicySource,
  UiValidationPolicy
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null || value === undefined) {
    return "none";
  }

  if (isRecord(value)) {
    return summarizePolicyCondition(value);
  }

  return String(value);
};

export const normalizeUiPolicy = (value: unknown): UiPolicy | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const protectedBranches = Array.isArray(value["protectedBranches"])
    ? value["protectedBranches"].filter((entry) => typeof entry === "string")
    : undefined;
  const sensitivePaths = isRecord(value["sensitivePaths"])
    ? {
        ...(Array.isArray(value["sensitivePaths"]["critical"])
          ? {
              critical: value["sensitivePaths"]["critical"].filter(
                (entry) => typeof entry === "string"
              )
            }
          : {}),
        ...(Array.isArray(value["sensitivePaths"]["high"])
          ? {
              high: value["sensitivePaths"]["high"].filter(
                (entry) => typeof entry === "string"
              )
            }
          : {}),
        ...(Array.isArray(value["sensitivePaths"]["medium"])
          ? {
              medium: value["sensitivePaths"]["medium"].filter(
                (entry) => typeof entry === "string"
              )
            }
          : {})
      }
    : undefined;
  const validation = isRecord(value["validation"])
    ? {
        ...(isRecord(value["validation"]["beforeCommit"])
          ? {
              beforeCommit: value["validation"][
                "beforeCommit"
              ] as UiValidationPolicy
            }
          : {}),
        ...(isRecord(value["validation"]["beforePush"])
          ? {
              beforePush: value["validation"][
                "beforePush"
              ] as UiValidationPolicy
            }
          : {})
      }
    : undefined;
  const rules = Array.isArray(value["rules"])
    ? value["rules"].flatMap((rule): UiPolicyRule[] => {
        if (!isRecord(rule) || typeof rule["id"] !== "string") {
          return [];
        }

        if (
          rule["decision"] !== "PROCEED" &&
          rule["decision"] !== "DEFER" &&
          rule["decision"] !== "ESCALATE" &&
          rule["decision"] !== "BLOCK"
        ) {
          return [];
        }

        return [
          {
            id: rule["id"],
            decision: rule["decision"],
            ...(isRecord(rule["when"]) ? { when: rule["when"] } : {}),
            ...(typeof rule["reason"] === "string"
              ? { reason: rule["reason"] }
              : {})
          }
        ];
      })
    : undefined;

  return {
    ...(typeof value["version"] === "string"
      ? { version: value["version"] }
      : {}),
    ...(protectedBranches !== undefined ? { protectedBranches } : {}),
    ...(sensitivePaths !== undefined ? { sensitivePaths } : {}),
    ...(validation !== undefined ? { validation } : {}),
    ...(isRecord(value["thresholds"])
      ? { thresholds: value["thresholds"] }
      : {}),
    ...(rules !== undefined ? { rules } : {})
  };
};

export const normalizeUiPolicySource = (
  value: unknown
): UiPolicySource | undefined => {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return undefined;
  }

  return {
    type: value["type"],
    ...(typeof value["path"] === "string" ? { path: value["path"] } : {}),
    ...(typeof value["version"] === "string"
      ? { version: value["version"] }
      : {})
  };
};

export const summarizePolicySource = (
  source: UiPolicySource | undefined
): string => {
  if (source === undefined) {
    return "No policy source available.";
  }

  const path = source.path !== undefined ? ` (${source.path})` : "";
  const version =
    source.version !== undefined ? ` · version ${source.version}` : "";

  return `${source.type}${path}${version}`;
};

export const summarizeProtectedBranches = (
  policy: UiPolicy | undefined
): string[] => policy?.protectedBranches ?? [];

export const summarizeSensitivePaths = (
  policy: UiPolicy | undefined
): Array<{ level: string; patterns: string[] }> => {
  const sensitivePaths = policy?.sensitivePaths;

  return [
    { level: "critical", patterns: sensitivePaths?.critical ?? [] },
    { level: "high", patterns: sensitivePaths?.high ?? [] },
    { level: "medium", patterns: sensitivePaths?.medium ?? [] }
  ].filter((entry) => entry.patterns.length > 0);
};

const summarizeValidationTarget = (
  label: string,
  policy: UiValidationPolicy | undefined
): string => {
  if (policy === undefined) {
    return `${label}: not configured`;
  }

  const required = policy.required === true ? "required" : "not required";
  const commands = policy.commands?.join(", ") ?? "no commands";

  return `${label}: ${required}; ${commands}`;
};

export const summarizeValidationPolicy = (
  policy: UiPolicy | undefined
): string[] => [
  summarizeValidationTarget("Before commit", policy?.validation?.beforeCommit),
  summarizeValidationTarget("Before push", policy?.validation?.beforePush)
];

export const summarizeThresholds = (
  policy: UiPolicy | undefined
): Array<{ key: string; value: string }> => {
  if (policy?.thresholds === undefined) {
    return [];
  }

  return Object.entries(policy.thresholds).map(([key, value]) => ({
    key,
    value: formatValue(value)
  }));
};

export const summarizePolicyCondition = (
  when: Record<string, unknown> | undefined
): string => {
  if (when === undefined || Object.keys(when).length === 0) {
    return "always";
  }

  return Object.entries(when)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join("; ");
};

export const summarizePolicyRules = (
  policy: UiPolicy | undefined
): UiPolicyRuleSummary[] =>
  (policy?.rules ?? []).map((rule) => ({
    id: rule.id,
    decision: rule.decision,
    condition: summarizePolicyCondition(rule.when),
    ...(rule.reason !== undefined ? { reason: rule.reason } : {})
  }));
