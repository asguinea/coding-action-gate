import { describe, expect, it } from "vitest";
import {
  parseAction,
  parseActionJsonString
} from "../../src/actions/parseAction.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import gitCommandFixture from "../../src/fixtures/actions/git-command.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };
import runCommandFixture from "../../src/fixtures/actions/run-command.json" with { type: "json" };
import validationCommandFixture from "../../src/fixtures/actions/validation-command.json" with { type: "json" };
import writeFileFixture from "../../src/fixtures/actions/write-file.json" with { type: "json" };

describe("parseAction", () => {
  it("accepts valid action fixture objects", () => {
    const fixtures = [
      readFileFixture,
      writeFileFixture,
      editFileFixture,
      deleteFileFixture,
      runCommandFixture,
      gitCommandFixture,
      validationCommandFixture
    ];

    for (const fixture of fixtures) {
      const result = parseAction(fixture);

      expect(result.ok).toBe(true);
    }
  });

  it("rejects an invalid action type", () => {
    const result = parseAction({
      ...readFileFixture,
      type: "unknown_action"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ACTION_VALIDATION_ERROR"
      }
    });
  });
});

describe("parseActionJsonString", () => {
  it("returns ACTION_INVALID_JSON for invalid JSON", () => {
    const result = parseActionJsonString("{");

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ACTION_INVALID_JSON"
      }
    });
  });

  it("returns ACTION_VALIDATION_ERROR for schema-invalid JSON", () => {
    const result = parseActionJsonString(
      JSON.stringify({
        ...readFileFixture,
        type: "unknown_action"
      })
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ACTION_VALIDATION_ERROR"
      }
    });
  });
});
