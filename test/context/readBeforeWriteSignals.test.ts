import { describe, expect, it } from "vitest";
import { buildReadBeforeWriteSignals } from "../../src/context/readBeforeWriteSignals.js";
import type { ReadBeforeWriteFreshnessInput } from "../../src/context/readBeforeWriteTypes.js";

const observation = {
  id: "obs_test",
  sessionId: "s1",
  path: "src/file.ts",
  absolutePath: "/repo/src/file.ts",
  relativePath: "src/file.ts",
  observedAt: "2026-04-30T10:00:00.000Z",
  contentHash: "abc123",
  hashAlgorithm: "sha256" as const,
  sizeBytes: 12,
  exists: true,
  source: "test" as const
};

const result = (
  status: ReadBeforeWriteFreshnessInput["status"],
  overrides: Partial<ReadBeforeWriteFreshnessInput> = {}
): ReadBeforeWriteFreshnessInput => ({
  path: "src/file.ts",
  absolutePath: "/repo/src/file.ts",
  status,
  reason: `${status} reason`,
  ...overrides
});

describe("buildReadBeforeWriteSignals", () => {
  it("returns empty signals when there are no targets", () => {
    expect(buildReadBeforeWriteSignals([])).toEqual({});
  });

  it("marks all fresh targets as recently read", () => {
    expect(
      buildReadBeforeWriteSignals([
        result("fresh", {
          lastObservation: observation,
          currentHash: "abc123"
        })
      ])
    ).toMatchObject({
      targetFileReadRecently: true,
      targetFileFreshness: "fresh",
      fileChangedSinceRead: false,
      lastReadTimestamp: observation.observedAt,
      lastReadHash: observation.contentHash,
      currentFileHash: "abc123",
      readBeforeWriteReason: "All mutation targets are fresh."
    });
  });

  it("uses stale over missing, unknown, and fresh for overall freshness", () => {
    expect(
      buildReadBeforeWriteSignals([
        result("fresh"),
        result("unknown"),
        result("missing"),
        result("stale")
      ])
    ).toMatchObject({
      targetFileReadRecently: false,
      targetFileFreshness: "stale",
      fileChangedSinceRead: true,
      readBeforeWriteReason: "stale reason"
    });
  });

  it("uses missing over unknown and fresh when no target is stale", () => {
    expect(
      buildReadBeforeWriteSignals([
        result("fresh"),
        result("unknown"),
        result("missing", {
          lastObservation: observation
        })
      ])
    ).toMatchObject({
      targetFileFreshness: "missing",
      fileChangedSinceRead: true
    });
  });

  it("normalizes no-observation reason text", () => {
    expect(
      buildReadBeforeWriteSignals([
        result("unknown", {
          reason: "No file observation exists for this path."
        })
      ])
    ).toMatchObject({
      targetFileReadRecently: false,
      targetFileFreshness: "unknown",
      readBeforeWriteReason:
        "Target file has not been observed in this session."
    });
  });

  it("does not expose metadata-only hashes as lastReadHash", () => {
    expect(
      buildReadBeforeWriteSignals([
        result("unknown", {
          lastObservation: {
            ...observation,
            contentHash: "metadata-only",
            metadataOnly: true
          }
        })
      ])
    ).not.toHaveProperty("lastReadHash");
  });
});
