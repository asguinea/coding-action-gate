import path from "node:path";
import type { ZodIssue } from "zod";

import type { StepHarborPolicy, PolicyRule } from "../domain/policies.js";
import { redactString } from "../redaction/redactString.js";
import type { LoadedPolicySource, PolicyLoadError } from "./policyErrors.js";

export type PolicySourceKind = "default" | "project" | "explicit";

export interface PolicySourceSummary {
  kind: PolicySourceKind;
  label: string;
}

export interface PolicySectionSummary {
  version: string;
  sections: string[];
  workspace: {
    allowedRootCount: number;
    forbiddenMutationOutsideWorkspace: boolean | "unspecified";
  };
  protectedBranchCount: number;
  sensitivePathCounts: {
    critical: number;
    high: number;
    medium: number;
  };
  validation: {
    beforeCommitRequired: boolean | "unspecified";
    beforeCommitCommandCount: number;
    beforePushRequired: boolean | "unspecified";
    beforePushCommandCount: number;
  };
  thresholds: {
    present: boolean;
    contextCompletenessMinimum?: number;
    sensitiveContextCompletenessMinimum?: number;
    maxRetriesSameGoal?: number;
  };
  rules: {
    total: number;
    proceed: number;
    defer: number;
    escalate: number;
    block: number;
    ids: string[];
  };
  sensitivePatterns: {
    critical: string[];
    high: string[];
    medium: string[];
  };
}

export interface PolicyShowResult {
  source: PolicySourceSummary;
  availableTemplates: string[];
  summary: PolicySectionSummary;
}

export interface PolicyValidationIssue {
  message: string;
}

export interface PolicyValidationResult {
  ok: boolean;
  source: PolicySourceSummary;
  issues: PolicyValidationIssue[];
}

const knownTemplateNames = ["basic", "node", "strict", "monorepo-lite"];

const relativePathLabel = (filePath: string, cwd: string): string => {
  const relative = path.relative(path.resolve(cwd), path.resolve(filePath));

  if (
    relative.length > 0 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  ) {
    return relative;
  }

  return path.basename(filePath);
};

export const summarizePolicySource = (
  source: LoadedPolicySource,
  cwd: string
): PolicySourceSummary => {
  if (source.type === "default") {
    return {
      kind: "default",
      label: "bundled default policy"
    };
  }

  return {
    kind: source.type === "explicit" ? "explicit" : "project",
    label: relativePathLabel(source.path, cwd)
  };
};

export const summarizePolicyErrorSource = (
  error: PolicyLoadError,
  cwd: string
): PolicySourceSummary => {
  if (error.path !== undefined) {
    return {
      kind: "project",
      label: relativePathLabel(error.path, cwd)
    };
  }

  return {
    kind: "default",
    label: "bundled default policy"
  };
};

const presentSections = (policy: StepHarborPolicy): string[] =>
  [
    ["workspace", policy.workspace],
    ["protectedBranches", policy.protectedBranches],
    ["sensitivePaths", policy.sensitivePaths],
    ["validation", policy.validation],
    ["thresholds", policy.thresholds],
    ["rules", policy.rules]
  ]
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name as string);

const decisionCount = (
  rules: PolicyRule[],
  decision: PolicyRule["decision"]
): number => rules.filter((rule) => rule.decision === decision).length;

const looksLikeSecretValue = (value: string): boolean =>
  !/[*/]/.test(value) &&
  /(?:^|[-_.])(secret|token|password|api[_-]?key)(?:[-_.]|$)/i.test(value);

const safePolicyString = (value: string): string => {
  const redacted = redactString(value).value;

  return looksLikeSecretValue(redacted) ? "[REDACTED]" : redacted;
};

const safePolicyStrings = (values: string[] = []): string[] =>
  values.map(safePolicyString).sort();

const safeRuleIds = (values: string[] = []): string[] =>
  values.map((value) => redactString(value).value).sort();

export const summarizePolicy = (
  policy: StepHarborPolicy
): PolicySectionSummary => {
  const rules = policy.rules ?? [];
  const sensitivePaths = policy.sensitivePaths ?? {};

  return {
    version: policy.version,
    sections: presentSections(policy),
    workspace: {
      allowedRootCount: policy.workspace?.allowedRoots?.length ?? 0,
      forbiddenMutationOutsideWorkspace:
        policy.workspace?.forbiddenMutationOutsideWorkspace ?? "unspecified"
    },
    protectedBranchCount: policy.protectedBranches?.length ?? 0,
    sensitivePathCounts: {
      critical: sensitivePaths.critical?.length ?? 0,
      high: sensitivePaths.high?.length ?? 0,
      medium: sensitivePaths.medium?.length ?? 0
    },
    validation: {
      beforeCommitRequired:
        policy.validation?.beforeCommit?.required ?? "unspecified",
      beforeCommitCommandCount:
        policy.validation?.beforeCommit?.commands?.length ?? 0,
      beforePushRequired:
        policy.validation?.beforePush?.required ?? "unspecified",
      beforePushCommandCount:
        policy.validation?.beforePush?.commands?.length ?? 0
    },
    thresholds: {
      present: policy.thresholds !== undefined,
      ...(policy.thresholds?.contextCompletenessMinimum !== undefined
        ? {
            contextCompletenessMinimum:
              policy.thresholds.contextCompletenessMinimum
          }
        : {}),
      ...(policy.thresholds?.sensitiveContextCompletenessMinimum !== undefined
        ? {
            sensitiveContextCompletenessMinimum:
              policy.thresholds.sensitiveContextCompletenessMinimum
          }
        : {}),
      ...(policy.thresholds?.maxRetriesSameGoal !== undefined
        ? { maxRetriesSameGoal: policy.thresholds.maxRetriesSameGoal }
        : {})
    },
    rules: {
      total: rules.length,
      proceed: decisionCount(rules, "PROCEED"),
      defer: decisionCount(rules, "DEFER"),
      escalate: decisionCount(rules, "ESCALATE"),
      block: decisionCount(rules, "BLOCK"),
      ids: safeRuleIds(rules.map((rule) => rule.id))
    },
    sensitivePatterns: {
      critical: safePolicyStrings(sensitivePaths.critical),
      high: safePolicyStrings(sensitivePaths.high),
      medium: safePolicyStrings(sensitivePaths.medium)
    }
  };
};

const issuePath = (issue: ZodIssue): string =>
  issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";

const loadErrorIssues = (error: PolicyLoadError): PolicyValidationIssue[] => {
  if (
    error.code === "POLICY_VALIDATION_ERROR" &&
    Array.isArray(error.details)
  ) {
    const zodIssues = error.details.filter((detail): detail is ZodIssue => {
      if (typeof detail !== "object" || detail === null) {
        return false;
      }

      return (
        "message" in detail &&
        typeof (detail as { message: unknown }).message === "string" &&
        "path" in detail &&
        Array.isArray((detail as { path: unknown }).path)
      );
    });

    if (zodIssues.length > 0) {
      return zodIssues.map((issue) => ({
        message: `${issuePath(issue)}${issue.message}`
      }));
    }
  }

  if (error.code === "POLICY_PARSE_ERROR") {
    return [{ message: "Policy file contains invalid YAML." }];
  }

  if (error.code === "POLICY_FILE_NOT_FOUND") {
    return [{ message: "Policy file was not found." }];
  }

  if (error.code === "POLICY_FILE_READ_ERROR") {
    return [{ message: "Policy file could not be read." }];
  }

  return [{ message: "Policy failed schema validation." }];
};

export const summarizePolicyValidationError = (
  error: PolicyLoadError,
  cwd: string
): PolicyValidationResult => ({
  ok: false,
  source: summarizePolicyErrorSource(error, cwd),
  issues: loadErrorIssues(error)
});

export const createPolicyShowResult = (
  policy: StepHarborPolicy,
  source: LoadedPolicySource,
  cwd: string
): PolicyShowResult => ({
  source: summarizePolicySource(source, cwd),
  availableTemplates: knownTemplateNames,
  summary: summarizePolicy(policy)
});

export const explainPolicy = (
  policy: StepHarborPolicy,
  source: LoadedPolicySource,
  cwd: string
): string[] => {
  const summary = summarizePolicy(policy);
  const sourceSummary = summarizePolicySource(source, cwd);
  const lines = [
    "StepHarbor Policy Explanation",
    "",
    `Source: ${sourceSummary.label} (${sourceSummary.kind})`,
    `Policy version: ${summary.version}`,
    "",
    "Practical behavior:",
    "- PROCEED: actions with no matching DEFER, ESCALATE, or BLOCK rules may proceed.",
    "- DEFER: the agent may continue autonomously, but must first gather missing evidence, refresh stale context, inspect related files, run checks, or clarify state before the original action can be authorized.",
    "- ESCALATE: actions may be valid but require human approval or review.",
    "- BLOCK: actions violate a hard safety or policy boundary and must not execute.",
    "",
    "Configured areas:"
  ];

  if (summary.workspace.allowedRootCount > 0) {
    lines.push(
      `- Workspace boundaries: ${summary.workspace.allowedRootCount} allowed root pattern(s); outside-workspace mutation is ${String(summary.workspace.forbiddenMutationOutsideWorkspace)}.`
    );
  } else {
    lines.push(
      "- Workspace boundaries: no explicit allowed roots are configured."
    );
  }

  lines.push(
    `- Sensitive paths: ${summary.sensitivePathCounts.critical} critical, ${summary.sensitivePathCounts.high} high, ${summary.sensitivePathCounts.medium} medium pattern(s). Sensitive edits tend to ESCALATE; secret-bearing mutations can BLOCK.`
  );

  lines.push(
    `- Command risk: policy rules include ${summary.rules.block} BLOCK, ${summary.rules.escalate} ESCALATE, and ${summary.rules.defer} DEFER outcome(s). Critical commands tend to BLOCK; high-risk commands tend to ESCALATE when matching rules are present.`
  );

  if (
    summary.validation.beforeCommitRequired === true ||
    summary.validation.beforePushRequired === true
  ) {
    lines.push(
      `- Validation gates: before-commit required=${String(summary.validation.beforeCommitRequired)}, before-push required=${String(summary.validation.beforePushRequired)}. Missing or stale required validation tends to DEFER; failed validation tends to BLOCK.`
    );
  } else {
    lines.push(
      "- Validation gates: validation is not required by this policy unless matching rules or runtime evidence require it."
    );
  }

  lines.push(
    `- Git workflow safety: ${summary.protectedBranchCount} protected branch pattern(s). Force push, hook bypass, and direct protected-branch pushes tend to BLOCK when matching rules are present.`
  );

  lines.push(
    "- Read-before-write and related context: stale or missing file observations and insufficient related context tend to DEFER. DEFER is not failure."
  );

  lines.push(
    "- Landing/deploy/publish gates: high-risk landing actions tend to ESCALATE and critical-risk landing actions tend to BLOCK when matching rules are present."
  );

  lines.push(
    "- Analytics: local analytics is not controlled by policy in this batch; use STEPHARBOR_ANALYTICS=0 to disable recording."
  );

  return lines;
};
