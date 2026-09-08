import { describe, expect, it } from "vitest";
import {
  clampScore,
  combineDimensionScores,
  deriveOverallLevel,
  deriveOverallReducibility,
  maxImpact,
  scoreToLevel,
  topDriversFromDimensions
} from "../../src/uncertainty/uncertaintyScoring.js";
import {
  createDefaultUncertaintyDimensions,
  uncertaintyDimensions,
  uncertaintyProfileSchemaVersion
} from "../../src/uncertainty/uncertaintyTypes.js";

describe("uncertainty scoring", () => {
  it("clamps invalid and out-of-range scores", () => {
    expect(clampScore(-0.5)).toBe(0);
    expect(clampScore(0.4)).toBe(0.4);
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("maps scores to deterministic threshold levels", () => {
    expect(scoreToLevel(0)).toBe("low");
    expect(scoreToLevel(0.24)).toBe("low");
    expect(scoreToLevel(0.25)).toBe("medium");
    expect(scoreToLevel(0.49)).toBe("medium");
    expect(scoreToLevel(0.5)).toBe("high");
    expect(scoreToLevel(0.79)).toBe("high");
    expect(scoreToLevel(0.8)).toBe("critical");
    expect(scoreToLevel(1)).toBe("critical");
  });

  it("derives overall level from the same score thresholds", () => {
    expect(deriveOverallLevel(0.5)).toBe("high");
  });

  it("returns the stronger impact", () => {
    expect(maxImpact("low", "critical")).toBe("critical");
    expect(maxImpact("high", "medium")).toBe("high");
  });

  it("combines dimension scores using deterministic maximum score", () => {
    const dimensions = createDefaultUncertaintyDimensions();

    dimensions.context = {
      ...dimensions.context,
      score: 0.4
    };
    dimensions.command = {
      ...dimensions.command,
      score: 0.85
    };

    expect(combineDimensionScores(dimensions)).toBe(0.85);
  });

  it("derives the strongest reducibility", () => {
    const dimensions = createDefaultUncertaintyDimensions();

    dimensions.context = {
      ...dimensions.context,
      reducibility: "partially_reducible"
    };
    dimensions.command = {
      ...dimensions.command,
      reducibility: "irreducible"
    };

    expect(deriveOverallReducibility(dimensions)).toBe("irreducible");
  });

  it("extracts stable top drivers by dimension score and limit", () => {
    const dimensions = createDefaultUncertaintyDimensions();

    dimensions.context = {
      ...dimensions.context,
      score: 0.6,
      drivers: ["target_file_not_observed", "shared_driver"]
    };
    dimensions.command = {
      ...dimensions.command,
      score: 0.9,
      drivers: ["command_risk_critical", "shared_driver"]
    };

    expect(topDriversFromDimensions(dimensions, 3)).toEqual([
      "command_risk_critical",
      "shared_driver",
      "target_file_not_observed"
    ]);
  });

  it("creates default profiles for every supported dimension", () => {
    const dimensions = createDefaultUncertaintyDimensions();

    expect(Object.keys(dimensions).sort()).toEqual(
      [...uncertaintyDimensions].sort()
    );

    for (const dimension of uncertaintyDimensions) {
      expect(dimensions[dimension]).toEqual({
        dimension,
        score: 0,
        level: "low",
        impact: "low",
        reducibility: "reducible",
        drivers: [],
        evidence: [],
        missingEvidence: []
      });
    }

    expect(uncertaintyProfileSchemaVersion).toBe("uncertainty-profile.v1");
  });
});
