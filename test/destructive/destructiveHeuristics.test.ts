import { describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { evaluateDestructiveAction } from "../../src/destructive/destructiveHeuristics.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import type { StepHarborPolicy } from "../../src/domain/policies.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import writeFileFixture from "../../src/fixtures/actions/write-file.json" with { type: "json" };

const policy: StepHarborPolicy = {
  version: "test",
  thresholds: {
    largeDiffFiles: 8,
    largeDiffLines: 500
  }
};

const normalizeFixture = (fixture: unknown) => {
  const result = parseAndNormalizeAction(fixture, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

describe("evaluateDestructiveAction", () => {
  it("classifies delete_file as destructive", () => {
    expect(
      evaluateDestructiveAction(normalizeFixture(deleteFileFixture), policy)
    ).toMatchObject({
      destructiveOperation: true,
      destructiveSubtype: "delete_file",
      destructiveSeverity: "high",
      destructiveReason: "File deletion is destructive."
    });
    expect(
      evaluateDestructiveAction(normalizeFixture(deleteFileFixture), policy)
        .destructiveScore
    ).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies empty write_file content as content_truncation", () => {
    const action = normalizeFixture({
      ...writeFileFixture,
      content: ""
    });

    expect(evaluateDestructiveAction(action, policy)).toMatchObject({
      destructiveOperation: true,
      destructiveSubtype: "content_truncation",
      destructiveSeverity: "medium",
      destructiveScore: 0.6
    });
  });

  it("does not classify normal write_file with non-empty content as destructive", () => {
    const action = normalizeFixture({
      ...writeFileFixture,
      content: "export const value = true;\n"
    });

    expect(evaluateDestructiveAction(action, policy)).toEqual({
      destructiveOperation: false
    });
  });

  it("classifies edit_file with deletedLines above threshold as destructive", () => {
    const action = normalizeFixture({
      ...editFileFixture,
      diffStats: {
        files: 1,
        addedLines: 10,
        deletedLines: 501
      }
    });

    expect(evaluateDestructiveAction(action, policy)).toMatchObject({
      destructiveOperation: true,
      destructiveSubtype: "high_deletion_ratio",
      destructiveSeverity: "high"
    });
  });

  it("classifies edit_file with high deletion ratio as destructive", () => {
    const action = normalizeFixture({
      ...editFileFixture,
      diffStats: {
        files: 1,
        addedLines: 10,
        deletedLines: 30
      }
    });

    expect(evaluateDestructiveAction(action, policy)).toMatchObject({
      destructiveOperation: true,
      destructiveSubtype: "high_deletion_ratio",
      destructiveSeverity: "medium"
    });
  });

  it("classifies edit_file with broad file count as destructive", () => {
    const action = normalizeFixture({
      ...editFileFixture,
      diffStats: {
        files: 8,
        addedLines: 8,
        deletedLines: 2
      }
    });

    expect(evaluateDestructiveAction(action, policy)).toMatchObject({
      destructiveOperation: true,
      destructiveSubtype: "broad_multi_file_change"
    });
  });

  it("does not classify small edit_file diff as destructive", () => {
    expect(
      evaluateDestructiveAction(normalizeFixture(editFileFixture), policy)
    ).toEqual({
      destructiveOperation: false
    });
  });

  it("classifies targetPaths count above threshold as broad_multi_file_change", () => {
    const editAction = {
      ...(editFileFixture as unknown as StepHarborAction),
      diffStats: {
        files: 1,
        addedLines: 1,
        deletedLines: 1
      }
    } as StepHarborAction;
    const normalized = normalizeAction(editAction, { cwd: process.cwd() });

    expect(normalized.ok).toBe(true);

    if (!normalized.ok) {
      throw new Error(normalized.error.message);
    }

    const action = {
      ...normalized.action,
      normalized: {
        ...normalized.action.normalized,
        absoluteTargetPaths: Array.from(
          { length: 8 },
          (_value, index) => `${process.cwd()}/file-${index}.ts`
        )
      }
    };

    expect(evaluateDestructiveAction(action, policy)).toMatchObject({
      destructiveOperation: true,
      destructiveSubtype: "broad_multi_file_change"
    });
  });
});
