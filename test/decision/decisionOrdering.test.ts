import { describe, expect, it } from "vitest";
import {
  highestSeverityDecision,
  isMoreSevereDecision
} from "../../src/decision/decisionOrdering.js";

describe("decision ordering", () => {
  it("BLOCK overrides ESCALATE and DEFER", () => {
    expect(highestSeverityDecision(["DEFER", "ESCALATE", "BLOCK"])).toBe(
      "BLOCK"
    );
  });

  it("ESCALATE overrides DEFER", () => {
    expect(highestSeverityDecision(["DEFER", "ESCALATE"])).toBe("ESCALATE");
    expect(isMoreSevereDecision("ESCALATE", "DEFER")).toBe(true);
  });
});
