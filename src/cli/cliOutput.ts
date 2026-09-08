import type { AuditLoggerResult } from "../audit/auditErrors.js";
import type { StepHarborDecision } from "../decision/decisionErrors.js";
import type { DeferredEvidenceRequirement } from "../defer/deferredActionTypes.js";
import type { LoadedPolicySource } from "../policy/policyErrors.js";
import { redactObject } from "../redaction/redactObject.js";
import { redactString } from "../redaction/redactString.js";
import type { CliError } from "./cliErrors.js";

export interface CliSuccessOutput {
  ok: true;
  dryRun?: boolean;
  executed?: boolean;
  action?: {
    id: string;
    type: string;
    command?: string;
  };
  read?: {
    targetPath: string;
    content?: string | null;
    sizeBytes?: number;
    contentHash?: string;
    metadataOnly: boolean;
  };
  observation?: {
    recorded: boolean;
    metadataOnly?: boolean;
    path?: string;
  };
  deferredAction?: {
    recorded: boolean;
    id?: string;
    path?: string;
  };
  retry?: {
    deferredActionId: string;
    evidenceSatisfied: boolean;
    unsatisfiedRequirements: DeferredEvidenceRequirement[];
    reauthorized: boolean;
    executed: false;
  };
  validation?:
    | {
        executed: true;
        kind: string;
        command: string;
        status: "passed" | "failed";
        exitCode: number;
        durationMs: number;
        outputSummary: string;
        outputHash: string;
        recorded: boolean;
        recordId?: string;
      }
    | {
        executed: false;
        reason: string;
      };
  decision: StepHarborDecision;
  policySource: LoadedPolicySource;
  audit:
    | {
        written: true;
        path: string;
        decisionId: string;
      }
    | {
        written: false;
      };
}

export interface CliErrorOutput {
  ok: false;
  error: CliError;
}

export type CliOutput = CliSuccessOutput | CliErrorOutput;

export const formatJsonOutput = (output: CliOutput): string =>
  `${JSON.stringify(redactObject(output).value, null, 2)}\n`;

const formatPolicySource = (source: LoadedPolicySource): string =>
  "path" in source ? `${source.type} (${source.path})` : source.type;

const formatAudit = (audit: CliSuccessOutput["audit"]): string =>
  audit.written ? audit.path : "not written";

const expectedRetryNextAction = (
  decision: StepHarborDecision["decision"]
): string => {
  switch (decision) {
    case "PROCEED":
      return "original action may be executed by the caller";
    case "DEFER":
      return "satisfy remaining evidence, then retry authorization";
    case "ESCALATE":
      return "request human approval before executing";
    case "BLOCK":
      return "do not execute the original action";
  }
};

export const formatHumanSuccess = (output: CliSuccessOutput): string => {
  const lines: string[] = [];

  if (output.dryRun === true && output.executed === false) {
    lines.push("StepHarbor exec dry-run: command was NOT executed.");
  }

  if (output.retry !== undefined) {
    lines.push(
      "StepHarbor retry: original action was NOT executed.",
      `Deferred action: ${output.retry.deferredActionId}`,
      `Evidence: ${output.retry.evidenceSatisfied ? "satisfied" : "missing"}`
    );
  }

  if (output.validation !== undefined) {
    if (output.validation.executed) {
      lines.push(
        `StepHarbor validation: ${redactString(output.validation.command).value}`,
        `Authorization decision: ${output.decision.decision}`,
        `Validation status: ${output.validation.status}`,
        `Exit code: ${output.validation.exitCode}`,
        `Duration: ${output.validation.durationMs} ms`,
        `Result recorded: ${output.validation.recordId ?? "unknown"}`
      );
    } else {
      lines.push(
        "StepHarbor validation: command was NOT executed.",
        `Authorization decision: ${output.decision.decision}`,
        `Reason: ${redactString(output.validation.reason).value}`
      );
    }
  }

  if (output.action?.command !== undefined) {
    lines.push(`Command: ${redactString(output.action.command).value}`);
  }

  if (output.read !== undefined) {
    if (output.read.metadataOnly) {
      lines.push(`Read metadata: ${output.read.targetPath}`);
    } else {
      lines.push(`Read: ${output.read.targetPath}`);
    }
  }

  lines.push(
    `StepHarbor decision: ${output.decision.decision}`,
    `Reason: ${redactString(output.decision.reason).value}`,
    `Policy source: ${formatPolicySource(output.policySource)}`,
    `Audit: ${formatAudit(output.audit)}`
  );

  if (output.retry?.reauthorized === true) {
    lines.push(
      `Expected next action: ${expectedRetryNextAction(output.decision.decision)}`
    );
  }

  if (output.observation !== undefined) {
    if (output.observation.recorded) {
      lines.push(
        output.observation.metadataOnly === true
          ? "Observation: recorded metadata-only"
          : "Observation: recorded"
      );
    } else {
      lines.push("Observation: not recorded");
    }
  }

  if (output.deferredAction?.recorded === true) {
    lines.push(
      `Deferred action recorded: ${output.deferredAction.id ?? "unknown"}`
    );
  }

  if (output.read?.contentHash !== undefined) {
    lines.push(`Hash: sha256:${output.read.contentHash}`);
  }

  if (output.read?.sizeBytes !== undefined) {
    lines.push(`Size: ${output.read.sizeBytes} bytes`);
  }

  if (
    output.read !== undefined &&
    output.decision.decision !== "PROCEED" &&
    output.read.content == null
  ) {
    lines.push("File content was not read.");
  }

  if (
    output.decision.requiredNextSteps !== undefined &&
    output.decision.requiredNextSteps.length > 0
  ) {
    lines.push("Required next steps:");

    for (const step of output.decision.requiredNextSteps) {
      lines.push(`- ${redactString(step).value}`);
    }
  }

  if (
    output.retry !== undefined &&
    output.retry.unsatisfiedRequirements.length > 0
  ) {
    lines.push("Unsatisfied requirements:");

    for (const requirement of output.retry.unsatisfiedRequirements) {
      const target =
        requirement.target !== undefined && requirement.target.length > 0
          ? ` (${requirement.target})`
          : "";
      lines.push(
        `- ${requirement.type}${target}: ${redactString(requirement.reason ?? "required").value}`
      );
    }
  }

  if (
    output.decision.missingContext !== undefined &&
    output.decision.missingContext.length > 0
  ) {
    lines.push("Missing context:");

    for (const entry of output.decision.missingContext) {
      const target =
        entry.target !== undefined && entry.target.length > 0
          ? ` (${entry.target})`
          : "";
      lines.push(
        `- ${entry.type}${target}: ${redactString(entry.reason ?? "required").value}`
      );
    }
  }

  if (
    output.decision.riskIfProceeding !== undefined &&
    output.decision.riskIfProceeding.length > 0
  ) {
    lines.push("Risk if proceeding:");

    for (const risk of output.decision.riskIfProceeding) {
      lines.push(`- ${redactString(risk).value}`);
    }
  }

  if (
    output.decision.fetchPlan !== undefined &&
    output.decision.fetchPlan.length > 0
  ) {
    lines.push("Fetch plan:");

    for (const step of output.decision.fetchPlan) {
      const target =
        step.target !== undefined && step.target.length > 0
          ? ` (${step.target})`
          : "";
      lines.push(
        `- ${step.type}${target}: ${redactString(step.reason ?? "safe step").value}`
      );
    }
  }

  if (output.decision.expectedNextDecision !== undefined) {
    lines.push(
      `Expected next decision: ${output.decision.expectedNextDecision}`
    );
  }

  if (output.decision.reanalysisRequired !== undefined) {
    lines.push(
      `Reanalysis required: ${
        output.decision.reanalysisRequired ? "yes" : "no"
      }`
    );
  }

  if (
    output.read !== undefined &&
    output.read.metadataOnly === false &&
    output.read.content !== undefined &&
    output.read.content !== null
  ) {
    lines.push("", redactString(output.read.content).value);
  }

  return `${lines.join("\n")}\n`;
};

export const formatHumanError = (error: CliError): string => {
  const redacted = redactObject(error).value;

  return `StepHarbor error [${redacted.code}]: ${redacted.message}\n`;
};

export const auditOutputFromResult = (
  result: AuditLoggerResult
): CliSuccessOutput["audit"] => {
  if (!result.ok) {
    return {
      written: false
    };
  }

  return {
    written: true,
    path: result.path,
    decisionId: result.record.decisionId
  };
};
