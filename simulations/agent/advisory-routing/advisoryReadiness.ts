import rawAdvisoryInterfaceBoundary from "./example-advisory-interface-boundary.json" with { type: "json" };
import rawAdvisoryReadinessSummary from "./example-advisory-readiness-summary.json" with { type: "json" };
import rawAdvisorySidecars from "./example-advisory-sidecars.json" with { type: "json" };
import rawMockAdvisoryRoutingOutputs from "./example-mock-advisory-routing.json" with { type: "json" };
import rawSideBySideComparisonReport from "./example-side-by-side-comparison-report.json" with { type: "json" };
import { validateAdvisoryInterfaceBoundary } from "./advisoryInterfaceBoundarySchema.js";
import { validateAdvisoryRoutingSidecars } from "./advisoryRoutingSchema.js";
import {
  buildSyntheticAdvisoryReadinessSummary,
  type AdvisoryReadinessSummary,
  validateAdvisoryReadinessSummary
} from "./advisoryReadinessSchema.js";
import { validateMockAdvisoryRoutingOutputs } from "./mockAdvisoryRoutingSchema.js";
import { validateAdvisorySideBySideComparisonReport } from "./sideBySideComparisonSchema.js";

export const loadExampleAdvisoryReadinessSummary =
  (): AdvisoryReadinessSummary =>
    validateAdvisoryReadinessSummary(rawAdvisoryReadinessSummary);

export const buildExampleAdvisoryReadinessSummary =
  (): AdvisoryReadinessSummary => {
    const sidecars = validateAdvisoryRoutingSidecars(rawAdvisorySidecars);
    const mockOutputs = validateMockAdvisoryRoutingOutputs(
      rawMockAdvisoryRoutingOutputs
    );
    const comparisonReport = validateAdvisorySideBySideComparisonReport(
      rawSideBySideComparisonReport
    );
    const interfaceBoundary = validateAdvisoryInterfaceBoundary(
      rawAdvisoryInterfaceBoundary
    );

    return buildSyntheticAdvisoryReadinessSummary({
      sidecarIds: sidecars.map((sidecar) => sidecar.sidecarId),
      mockRoutingOutputIds: mockOutputs.map(
        (output) => output.mockRoutingOutputId
      ),
      sideBySideComparisonReportId: comparisonReport.comparisonReportId,
      advisoryInterfaceBoundaryId: interfaceBoundary.interfaceBoundaryId
    });
  };
