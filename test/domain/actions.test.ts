import { describe, expect, it } from "vitest";
import { stepHarborActionSchema } from "../../src/domain/actions.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import gitCommandFixture from "../../src/fixtures/actions/git-command.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };
import runCommandFixture from "../../src/fixtures/actions/run-command.json" with { type: "json" };
import validationCommandFixture from "../../src/fixtures/actions/validation-command.json" with { type: "json" };
import writeFileFixture from "../../src/fixtures/actions/write-file.json" with { type: "json" };

describe("StepHarbor actions", () => {
  it("parses every action fixture", () => {
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
      expect(stepHarborActionSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it("rejects an invalid action type", () => {
    const result = stepHarborActionSchema.safeParse({
      ...readFileFixture,
      type: "unknown_action"
    });

    expect(result.success).toBe(false);
  });
});
