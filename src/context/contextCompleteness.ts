import type {
  ContextCompletenessInput,
  ContextCompletenessResult
} from "./relatedContextTypes.js";

export const computeContextCompleteness = (
  input: ContextCompletenessInput
): ContextCompletenessResult => {
  if (!input.relatedTestsFound) {
    return {
      contextCompletenessScore: 1,
      dependencyClosureScore: 1,
      relatedContextReason: "No related test files were found."
    };
  }

  if (input.relatedTestsRead) {
    return {
      contextCompletenessScore: 1,
      dependencyClosureScore: 1,
      relatedContextReason: "Related tests have been inspected."
    };
  }

  return {
    contextCompletenessScore: 0.5,
    dependencyClosureScore: 0.5,
    relatedContextReason: "Related tests have not been inspected."
  };
};
