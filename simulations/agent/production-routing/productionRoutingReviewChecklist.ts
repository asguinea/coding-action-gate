import rawDefaultOffRoutingConfig from "./example-default-off-routing-config.json" with { type: "json" };
import rawProductionRoutingEligibility from "./example-production-eligibility.json" with { type: "json" };
import rawProductionRoutingReviewChecklist from "./example-production-routing-review-checklist.json" with { type: "json" };
import rawSafetyOverrideFallbackRules from "./example-safety-override-fallback-rules.json" with { type: "json" };
import { validateDefaultOffRoutingConfig } from "./defaultOffRoutingConfigSchema.js";
import { validateProductionRoutingEligibility } from "./productionEligibilitySchema.js";
import { validateSafetyOverrideFallbackRules } from "./safetyOverrideFallbackRulesSchema.js";
import {
  buildProductionRoutingReviewChecklistFromLinkedRecords,
  type ProductionRoutingReviewChecklist,
  validateProductionRoutingReviewChecklist
} from "./productionRoutingReviewChecklistSchema.js";

export const loadExampleProductionRoutingReviewChecklist =
  (): ProductionRoutingReviewChecklist =>
    validateProductionRoutingReviewChecklist(
      rawProductionRoutingReviewChecklist
    );

export const buildExampleProductionRoutingReviewChecklist =
  (): ProductionRoutingReviewChecklist => {
    const eligibility = validateProductionRoutingEligibility(
      rawProductionRoutingEligibility
    );
    const config = validateDefaultOffRoutingConfig(rawDefaultOffRoutingConfig);
    const rules = validateSafetyOverrideFallbackRules(
      rawSafetyOverrideFallbackRules
    );

    return buildProductionRoutingReviewChecklistFromLinkedRecords(
      eligibility,
      config,
      rules
    );
  };
