import { describe, expect, it } from "vitest";
import { mergeSignals } from "../../src/signals/signalMerging.js";

describe("mergeSignals", () => {
  it("lets provided signals override computed signals", () => {
    expect(
      mergeSignals(
        {
          pathSensitivity: "high"
        },
        {
          pathSensitivity: "low",
          destructiveOperation: false
        }
      )
    ).toEqual({
      pathSensitivity: "high",
      destructiveOperation: false
    });
  });

  it("does not overwrite computed values with undefined provided values", () => {
    expect(
      mergeSignals(
        {
          pathSensitivity: undefined
        },
        {
          pathSensitivity: "low",
          mutatesFilesystem: true
        }
      )
    ).toEqual({
      pathSensitivity: "low",
      mutatesFilesystem: true
    });
  });
});
