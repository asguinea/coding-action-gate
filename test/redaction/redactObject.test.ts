import { describe, expect, it } from "vitest";
import { redactObject } from "../../src/redaction/redactObject.js";

describe("redactObject", () => {
  it("redacts sensitive key values", () => {
    expect(redactObject({ password: "not-patterned" }).value).toEqual({
      password: "[REDACTED]"
    });
  });

  it("redacts nested sensitive values", () => {
    expect(
      redactObject({
        auth: {
          access_token: "not-patterned"
        }
      }).value
    ).toEqual({
      auth: {
        access_token: "[REDACTED]"
      }
    });
  });

  it("redacts arrays", () => {
    const result = redactObject([
      "normal",
      "sk-abcdefghijklmnopqrstuvwxyz123456"
    ]);

    expect(result.value).toEqual(["normal", "[REDACTED]"]);
    expect(result.redactionCount).toBe(1);
  });

  it("does not mutate original objects", () => {
    const original = {
      nested: {
        token: "not-patterned"
      }
    };
    const result = redactObject(original);

    expect(result.value).toEqual({
      nested: {
        token: "[REDACTED]"
      }
    });
    expect(original).toEqual({
      nested: {
        token: "not-patterned"
      }
    });
  });

  it("respects maxDepth", () => {
    const input = {
      level1: {
        level2: {
          api_key: "not-patterned"
        }
      }
    };

    expect(redactObject(input, { maxDepth: 1 }).value).toEqual(input);
  });
});
