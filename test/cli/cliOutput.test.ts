import { describe, expect, it } from "vitest";
import {
  formatHumanSuccess,
  formatJsonOutput
} from "../../src/cli/cliOutput.js";
import type { CliSuccessOutput } from "../../src/cli/cliOutput.js";

const output: CliSuccessOutput = {
  ok: true,
  decision: {
    decision: "DEFER",
    reason: "Target file state is not fresh.",
    matchedPolicies: [],
    signalSummary: {},
    deferReasonCategory: "target_file_never_read",
    requiredNextSteps: [
      "Gather missing context or satisfy the matched policy condition, then retry authorization."
    ],
    missingContext: [
      {
        type: "target_file_freshness",
        target: "src/index.ts",
        reason: "Target file state is not fresh.",
        required: true
      }
    ],
    fetchPlan: [
      {
        type: "read_file",
        target: "src/index.ts",
        safe: true,
        reason: "Refresh target file before mutation."
      }
    ],
    riskIfProceeding: ["The agent may edit a file it has not inspected."],
    reanalysisRequired: true,
    expectedNextDecision: "PROCEED"
  },
  policySource: {
    type: "default"
  },
  audit: {
    written: false
  }
};

describe("CLI output formatting", () => {
  it("formats human-readable success output", () => {
    expect(formatHumanSuccess(output)).toContain(
      "CodingActionGate decision: DEFER"
    );
    expect(formatHumanSuccess(output)).toContain("Missing context:");
    expect(formatHumanSuccess(output)).toContain("Fetch plan:");
    expect(formatHumanSuccess(output)).toContain("Risk if proceeding:");
    expect(formatHumanSuccess(output)).toContain(
      "Expected next decision: PROCEED"
    );
    expect(formatHumanSuccess(output)).toContain("Reanalysis required: yes");
  });

  it("formats JSON output", () => {
    const parsed = JSON.parse(formatJsonOutput(output)) as CliSuccessOutput;

    expect(parsed.ok).toBe(true);
    expect(parsed.decision.decision).toBe("DEFER");
    expect(parsed.decision.fetchPlan).toBeDefined();
    expect(parsed.decision.riskIfProceeding).toBeDefined();
    expect(parsed.decision.expectedNextDecision).toBe("PROCEED");
    expect(parsed.audit.written).toBe(false);
  });
});
