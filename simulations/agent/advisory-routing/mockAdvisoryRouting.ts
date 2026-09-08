import rawAdvisorySidecars from "./example-advisory-sidecars.json" with { type: "json" };
import rawMockAdvisoryRoutingOutputs from "./example-mock-advisory-routing.json" with { type: "json" };
import {
  validateAdvisoryRoutingSidecars,
  type AdvisoryRoutingSidecar
} from "./advisoryRoutingSchema.js";
import {
  buildMockAdvisoryRoutingOutputs,
  type MockAdvisoryRoutingOutput,
  validateMockAdvisoryRoutingOutputs
} from "./mockAdvisoryRoutingSchema.js";

export const loadExampleMockAdvisoryRoutingOutputs =
  (): MockAdvisoryRoutingOutput[] =>
    validateMockAdvisoryRoutingOutputs(rawMockAdvisoryRoutingOutputs);

export const buildExampleMockAdvisoryRoutingOutputs =
  (): MockAdvisoryRoutingOutput[] =>
    buildMockAdvisoryRoutingOutputs(
      validateAdvisoryRoutingSidecars(rawAdvisorySidecars)
    );

export const loadExampleMockAdvisoryRoutingSidecars =
  (): AdvisoryRoutingSidecar[] =>
    validateAdvisoryRoutingSidecars(rawAdvisorySidecars);
