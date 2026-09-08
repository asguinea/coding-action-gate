import rawExampleAdvisorySidecars from "./example-advisory-sidecars.json" with { type: "json" };
import {
  type AdvisoryRoutingSidecar,
  validateAdvisoryRoutingSidecars
} from "./advisoryRoutingSchema.js";

export * from "./advisoryRoutingSchema.js";
export * from "./mockAdvisoryRoutingSchema.js";
export * from "./mockAdvisoryRouting.js";
export * from "./sideBySideComparisonSchema.js";
export * from "./sideBySideComparison.js";
export * from "./advisoryInterfaceBoundarySchema.js";
export * from "./advisoryReadinessSchema.js";
export * from "./advisoryReadiness.js";

export const loadExampleAdvisoryRoutingSidecars =
  (): AdvisoryRoutingSidecar[] =>
    validateAdvisoryRoutingSidecars(rawExampleAdvisorySidecars);
