import rawDefaultOffRoutingConfig from "./example-default-off-routing-config.json" with { type: "json" };
import rawProductionRoutingEligibility from "./example-production-eligibility.json" with { type: "json" };
import rawSafetyOverrideFallbackRules from "./example-safety-override-fallback-rules.json" with { type: "json" };
import { validateDefaultOffRoutingConfig } from "./defaultOffRoutingConfigSchema.js";
import { validateProductionRoutingEligibility } from "./productionEligibilitySchema.js";
import {
  buildSafetyOverrideFallbackRulesFromLinkedRecords,
  type SafetyOverrideFallbackRules,
  validateSafetyOverrideFallbackRules
} from "./safetyOverrideFallbackRulesSchema.js";

export const loadExampleSafetyOverrideFallbackRules =
  (): SafetyOverrideFallbackRules =>
    validateSafetyOverrideFallbackRules(rawSafetyOverrideFallbackRules);

export const buildExampleSafetyOverrideFallbackRules =
  (): SafetyOverrideFallbackRules => {
    const eligibility = validateProductionRoutingEligibility(
      rawProductionRoutingEligibility
    );
    const config = validateDefaultOffRoutingConfig(rawDefaultOffRoutingConfig);

    return buildSafetyOverrideFallbackRulesFromLinkedRecords(
      eligibility,
      config
    );
  };
