import { describe, expect, it } from "vitest";
import { buildMissingContext } from "../../src/defer/missingContextBuilder.js";

describe("buildMissingContext", () => {
  it("generates current file contents context for unknown freshness", () => {
    expect(buildMissingContext("target_file_never_read", "README.md")).toEqual([
      {
        type: "current_file_contents",
        target: "README.md",
        reason: "Target file has not been observed in this session.",
        required: true
      }
    ]);
  });

  it("generates current file contents context for stale freshness", () => {
    expect(buildMissingContext("target_file_stale", "README.md")).toEqual([
      {
        type: "current_file_contents",
        target: "README.md",
        reason: "Target file changed since the last observation.",
        required: true
      }
    ]);
  });

  it("generates file existence context for missing freshness", () => {
    expect(buildMissingContext("target_file_missing", "README.md")).toEqual([
      {
        type: "file_existence",
        target: "README.md",
        reason: "Target file is missing or no longer available.",
        required: true
      }
    ]);
  });

  it("generates full observation context for metadata-only observations", () => {
    expect(
      buildMissingContext("metadata_only_observation", "README.md")
    ).toEqual([
      {
        type: "full_file_observation",
        target: "README.md",
        reason:
          "Latest observation is metadata-only and cannot authorize mutation.",
        required: true
      }
    ]);
  });

  it("generates validation context for not-run validation", () => {
    expect(buildMissingContext("validation_not_run", undefined)).toEqual([
      {
        type: "validation_result",
        reason: "Required validation has not been run.",
        required: true
      }
    ]);
  });

  it("generates validation context for stale validation", () => {
    expect(buildMissingContext("validation_stale", undefined)).toEqual([
      {
        type: "validation_result",
        reason: "Validation is stale relative to the current action.",
        required: true
      }
    ]);
  });
});
