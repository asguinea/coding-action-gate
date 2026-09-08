import rawDefaultOffRoutingConfig from "./example-default-off-routing-config.json" with { type: "json" };
import rawPhase16GateSummary from "./example-phase-16-gate-summary.json" with { type: "json" };
import rawProductionRoutingEligibility from "./example-production-eligibility.json" with { type: "json" };
import rawProductionRoutingReviewChecklist from "./example-production-routing-review-checklist.json" with { type: "json" };
import rawSafetyOverrideFallbackRules from "./example-safety-override-fallback-rules.json" with { type: "json" };
import { validateDefaultOffRoutingConfig } from "./defaultOffRoutingConfigSchema.js";
import { validateProductionRoutingEligibility } from "./productionEligibilitySchema.js";
import { validateProductionRoutingReviewChecklist } from "./productionRoutingReviewChecklistSchema.js";
import { validateSafetyOverrideFallbackRules } from "./safetyOverrideFallbackRulesSchema.js";
import {
  buildPhase16GateSummaryFromLinkedRecords,
  type Phase16GateSummary,
  validatePhase16GateSummary
} from "./phase16GateSummarySchema.js";

export const loadExamplePhase16GateSummary = (): Phase16GateSummary =>
  validatePhase16GateSummary(rawPhase16GateSummary);

export const buildExamplePhase16GateSummary = (): Phase16GateSummary => {
  const eligibility = validateProductionRoutingEligibility(
    rawProductionRoutingEligibility
  );
  const config = validateDefaultOffRoutingConfig(rawDefaultOffRoutingConfig);
  const rules = validateSafetyOverrideFallbackRules(
    rawSafetyOverrideFallbackRules
  );
  const checklist = validateProductionRoutingReviewChecklist(
    rawProductionRoutingReviewChecklist
  );

  return buildPhase16GateSummaryFromLinkedRecords(
    eligibility,
    config,
    rules,
    checklist
  );
};
