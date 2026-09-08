import rawMockAdvisoryRoutingOutputs from "./example-mock-advisory-routing.json" with { type: "json" };
import rawSideBySideComparisonReport from "./example-side-by-side-comparison-report.json" with { type: "json" };
import {
  buildAdvisorySideBySideComparisonReport,
  type AdvisorySideBySideComparisonReport,
  validateAdvisorySideBySideComparisonReport
} from "./sideBySideComparisonSchema.js";
import { validateMockAdvisoryRoutingOutputs } from "./mockAdvisoryRoutingSchema.js";

export const loadExampleAdvisorySideBySideComparisonReport =
  (): AdvisorySideBySideComparisonReport =>
    validateAdvisorySideBySideComparisonReport(rawSideBySideComparisonReport);

export const buildExampleAdvisorySideBySideComparisonReport =
  (): AdvisorySideBySideComparisonReport =>
    buildAdvisorySideBySideComparisonReport(
      validateMockAdvisoryRoutingOutputs(rawMockAdvisoryRoutingOutputs)
    );
