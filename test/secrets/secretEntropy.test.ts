import { describe, expect, it } from "vitest";
import {
  detectEntropyAnomaly,
  shannonEntropy
} from "../../src/secrets/secretEntropy.js";

const highEntropyToken = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6";

describe("secret entropy detection", () => {
  it("computes higher entropy for varied strings", () => {
    expect(shannonEntropy(highEntropyToken)).toBeGreaterThan(4);
  });

  it("classifies unlabeled high entropy strings as possible", () => {
    expect(detectEntropyAnomaly(highEntropyToken)).toEqual({
      confidence: "possible",
      nearSecretLabel: false
    });
  });

  it("classifies entropy near token labels as probable", () => {
    expect(detectEntropyAnomaly(`token=${highEntropyToken}`)).toEqual({
      confidence: "probable",
      nearSecretLabel: true
    });
  });

  it("does not flag normal README text", () => {
    expect(
      detectEntropyAnomaly(
        "StepHarbor is a runtime authorization layer for agentic coding."
      )
    ).toBeUndefined();
  });
});
