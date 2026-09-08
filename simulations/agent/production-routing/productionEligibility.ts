import rawAdvisoryReadinessSummary from "../advisory-routing/example-advisory-readiness-summary.json" with { type: "json" };
import rawProductionRoutingEligibility from "./example-production-eligibility.json" with { type: "json" };
import { validateAdvisoryReadinessSummary } from "../advisory-routing/advisoryReadinessSchema.js";
import {
  buildSyntheticProductionRoutingEligibility,
  type ProductionRoutingEligibility,
  validateProductionRoutingEligibility
} from "./productionEligibilitySchema.js";

export const loadExampleProductionRoutingEligibility =
  (): ProductionRoutingEligibility =>
    validateProductionRoutingEligibility(rawProductionRoutingEligibility);

export const buildExampleProductionRoutingEligibility =
  (): ProductionRoutingEligibility => {
    const readiness = validateAdvisoryReadinessSummary(
      rawAdvisoryReadinessSummary
    );

    return buildSyntheticProductionRoutingEligibility({
      readinessSummaryId: readiness.readinessSummaryId
    });
  };
