import { describe, expect, it } from "vitest";
import { buildRiskIfProceeding } from "../../src/defer/riskIfProceedingBuilder.js";

describe("buildRiskIfProceeding", () => {
  it("generates freshness risks", () => {
    expect(buildRiskIfProceeding("target_file_never_read")).toEqual([
      "The agent may edit a file it has not inspected.",
      "The proposed change may overwrite unknown current content."
    ]);
    expect(buildRiskIfProceeding("target_file_stale")).toEqual([
      "The proposed change may revert newer user or agent edits.",
      "The agent may be acting on stale file state."
    ]);
    expect(buildRiskIfProceeding("target_file_missing")).toEqual([
      "The action may target a file that no longer exists.",
      "The agent may recreate or delete the wrong file."
    ]);
  });

  it("generates validation risks", () => {
    expect(buildRiskIfProceeding("validation_not_run")).toEqual([
      "The change may be committed or landed without evidence that it works."
    ]);
    expect(buildRiskIfProceeding("validation_stale")).toEqual([
      "Validation results may no longer apply to the current diff."
    ]);
  });

  it("adds pending escalation risk when requested", () => {
    expect(buildRiskIfProceeding("target_file_stale", true)).toContain(
      "After context is refreshed, this action may still require human approval."
    );
  });
});
