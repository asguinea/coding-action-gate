import rawOfflineScoreInputSet from "./example-offline-score-inputs.json" with { type: "json" };
import {
  type OfflineScoreInputSet,
  validateOfflineScoreInputSet
} from "./offlineScoreSchema.js";

export const loadExampleOfflineScoreInputSet = (): OfflineScoreInputSet =>
  validateOfflineScoreInputSet(rawOfflineScoreInputSet);
