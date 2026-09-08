import { describe, expect, it } from "vitest";
import { computeContextCompleteness } from "../../src/context/contextCompleteness.js";

describe("computeContextCompleteness", () => {
  it("returns 1.0 when no related tests are found", () => {
    expect(
      computeContextCompleteness({
        relatedTestsFound: false,
        relatedTestsRead: false
      })
    ).toMatchObject({
      contextCompletenessScore: 1,
      dependencyClosureScore: 1
    });
  });

  it("returns 0.5 when related tests exist but were not read", () => {
    expect(
      computeContextCompleteness({
        relatedTestsFound: true,
        relatedTestsRead: false
      })
    ).toMatchObject({
      contextCompletenessScore: 0.5,
      dependencyClosureScore: 0.5
    });
  });

  it("returns 1.0 when related tests were read", () => {
    expect(
      computeContextCompleteness({
        relatedTestsFound: true,
        relatedTestsRead: true
      })
    ).toMatchObject({
      contextCompletenessScore: 1,
      dependencyClosureScore: 1
    });
  });
});
