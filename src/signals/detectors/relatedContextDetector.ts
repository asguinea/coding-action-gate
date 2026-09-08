import { checkFileFreshness } from "../../observations/fileFreshness.js";
import { computeContextCompleteness } from "../../context/contextCompleteness.js";
import { findRelatedContext } from "../../context/relatedContextFinder.js";
import type { SafetySignalDetector } from "./baseDetector.js";

const applicableActionTypes = new Set(["edit_file", "write_file"]);

const isApplicableAction = (actionType: string): boolean =>
  applicableActionTypes.has(actionType);

export const relatedContextDetector: SafetySignalDetector = {
  id: "related-context",
  async compute({ action, context }) {
    if (!isApplicableAction(action.type)) {
      return {};
    }

    const targetPath = action.normalized.relativeTargetPath;

    if (targetPath === undefined) {
      return {
        contextCompletenessScore: 1,
        dependencyClosureScore: 1,
        relatedTestsFound: false,
        relatedTestsRead: false,
        relatedContextReason:
          "No mutation target was available for related context checks."
      };
    }

    const cwd = context?.cwd ?? process.cwd();
    const sessionId = context?.session?.sessionId ?? "default";
    const relatedContext = await findRelatedContext({
      targetPath,
      cwd
    });
    const relatedTestsFound = relatedContext.existingRelatedTests.length > 0;
    const freshnessResults = await Promise.all(
      relatedContext.existingRelatedTests.map((testPath) =>
        checkFileFreshness({
          path: testPath,
          cwd,
          sessionId,
          ...(context?.observationDir !== undefined
            ? { observationDir: context.observationDir }
            : {})
        })
      )
    );
    const relatedTestsRead =
      relatedTestsFound &&
      freshnessResults.some((result) => result.status === "fresh");
    const completeness = computeContextCompleteness({
      relatedTestsFound,
      relatedTestsRead
    });

    return {
      contextCompletenessScore: completeness.contextCompletenessScore,
      dependencyClosureScore: completeness.dependencyClosureScore,
      relatedTestsFound,
      relatedTestsRead,
      ...(relatedContext.existingRelatedTests.length > 0
        ? { relatedTestPaths: relatedContext.existingRelatedTests }
        : {}),
      callersFound: undefined,
      callersRead: undefined,
      configRead: undefined,
      relatedContextReason: completeness.relatedContextReason
    };
  }
};
