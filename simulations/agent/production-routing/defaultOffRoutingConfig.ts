import rawDefaultOffRoutingConfig from "./example-default-off-routing-config.json" with { type: "json" };
import rawProductionRoutingEligibility from "./example-production-eligibility.json" with { type: "json" };
import {
  buildDefaultOffRoutingConfigFromEligibility,
  type DefaultOffRoutingConfig,
  validateDefaultOffRoutingConfig
} from "./defaultOffRoutingConfigSchema.js";
import { validateProductionRoutingEligibility } from "./productionEligibilitySchema.js";

export const loadExampleDefaultOffRoutingConfig = (): DefaultOffRoutingConfig =>
  validateDefaultOffRoutingConfig(rawDefaultOffRoutingConfig);

export const buildExampleDefaultOffRoutingConfig =
  (): DefaultOffRoutingConfig => {
    const eligibility = validateProductionRoutingEligibility(
      rawProductionRoutingEligibility
    );

    return buildDefaultOffRoutingConfigFromEligibility(eligibility);
  };
