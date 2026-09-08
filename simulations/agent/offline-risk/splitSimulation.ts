import rawOfflineScoreInputSet from "./example-offline-score-inputs.json" with { type: "json" };
import { validateOfflineScoreInputSet } from "./offlineScoreSchema.js";
import {
  buildSyntheticOfflineSplitSimulation,
  type OfflineSplitSimulation
} from "./splitSimulationSchema.js";

export const loadExampleOfflineSplitSimulation = (): OfflineSplitSimulation =>
  buildSyntheticOfflineSplitSimulation(
    validateOfflineScoreInputSet(rawOfflineScoreInputSet)
  );
