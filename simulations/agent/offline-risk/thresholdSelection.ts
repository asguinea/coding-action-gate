import rawOfflineScoreInputSet from "./example-offline-score-inputs.json" with { type: "json" };
import rawOfflineSplitSimulation from "./example-split-simulation.json" with { type: "json" };
import { validateOfflineScoreInputSet } from "./offlineScoreSchema.js";
import { validateOfflineSplitSimulation } from "./splitSimulationSchema.js";
import {
  buildSyntheticOfflineThresholdSelection,
  type OfflineThresholdSelection
} from "./thresholdSelectionSchema.js";

export const loadExampleOfflineThresholdSelection =
  (): OfflineThresholdSelection =>
    buildSyntheticOfflineThresholdSelection(
      validateOfflineScoreInputSet(rawOfflineScoreInputSet),
      validateOfflineSplitSimulation(rawOfflineSplitSimulation)
    );
