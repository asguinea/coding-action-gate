import { describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { actionMetadataDetector } from "../../src/signals/detectors/actionMetadataDetector.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };
import validationCommandFixture from "../../src/fixtures/actions/validation-command.json" with { type: "json" };
import writeFileFixture from "../../src/fixtures/actions/write-file.json" with { type: "json" };

const normalizeFixture = (fixture: unknown) => {
  const result = parseAndNormalizeAction(fixture, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const compute = (fixture: unknown) =>
  actionMetadataDetector.compute({
    action: normalizeFixture(fixture),
    policy: {
      version: "test"
    }
  });

describe("actionMetadataDetector", () => {
  it("sets destructiveOperation true for delete_file", () => {
    expect(compute(deleteFileFixture)).toMatchObject({
      destructiveOperation: true
    });
  });

  it("sets destructiveSubtype for delete_file", () => {
    expect(compute(deleteFileFixture)).toMatchObject({
      destructiveSubtype: "delete_file"
    });
  });

  it("sets mutatesFilesystem true for write/edit/delete actions", () => {
    expect(compute(writeFileFixture)).toMatchObject({
      mutatesFilesystem: true
    });
    expect(compute(editFileFixture)).toMatchObject({
      mutatesFilesystem: true
    });
    expect(compute(deleteFileFixture)).toMatchObject({
      mutatesFilesystem: true
    });
  });

  it("sets mutatesFilesystem false for read_file", () => {
    expect(compute(readFileFixture)).toMatchObject({
      mutatesFilesystem: false
    });
  });

  it("sets validationStatus unknown for validation_command", () => {
    expect(compute(validationCommandFixture)).toMatchObject({
      validationStatus: "unknown"
    });
  });

  it("sets delegationProvenance from action origin", () => {
    expect(compute(readFileFixture)).toMatchObject({
      delegationProvenance: "partial"
    });
  });
});
