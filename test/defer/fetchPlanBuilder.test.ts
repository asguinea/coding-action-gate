import { describe, expect, it } from "vitest";
import { buildFetchPlan } from "../../src/defer/fetchPlanBuilder.js";

describe("buildFetchPlan", () => {
  it("generates read_file for unknown freshness", () => {
    expect(buildFetchPlan("target_file_never_read", "README.md")).toEqual([
      {
        type: "read_file",
        target: "README.md",
        safe: true,
        reason: "Read the current target file before retrying authorization."
      }
    ]);
  });

  it("generates read_file for stale freshness", () => {
    expect(buildFetchPlan("target_file_stale", "README.md")).toEqual([
      {
        type: "read_file",
        target: "README.md",
        safe: true,
        reason: "Refresh the target file and recompute its current hash."
      }
    ]);
  });

  it("generates read_file for missing freshness", () => {
    expect(buildFetchPlan("target_file_missing", "README.md")).toEqual([
      {
        type: "read_file",
        target: "README.md",
        safe: true,
        reason:
          "Confirm whether the target file exists before retrying authorization."
      }
    ]);
  });

  it("generates run_validation for validation deferrals", () => {
    expect(buildFetchPlan("validation_not_run", undefined)).toEqual([
      {
        type: "run_validation",
        safe: true,
        reason: "Run required validation before retrying authorization."
      }
    ]);
    expect(buildFetchPlan("validation_stale", undefined)).toEqual([
      {
        type: "run_validation",
        safe: true,
        reason: "Run required validation before retrying authorization."
      }
    ]);
  });
});
