import rawRiskLossDesign from "./example-risk-loss-design.json" with { type: "json" };
import rawOfflineScoreInputSet from "./example-offline-score-inputs.json" with { type: "json" };
import rawOfflineSplitSimulation from "./example-split-simulation.json" with { type: "json" };
import rawOfflineThresholdSelection from "./example-threshold-selection.json" with { type: "json" };
import { validateRiskLossDesign } from "./riskLossDesignSchema.js";
import { validateOfflineScoreInputSet } from "./offlineScoreSchema.js";
import { validateOfflineSplitSimulation } from "./splitSimulationSchema.js";
import { validateOfflineThresholdSelection } from "./thresholdSelectionSchema.js";
import {
  buildSyntheticOfflineEvaluationReport,
  type OfflineEvaluationReport
} from "./evaluationReportSchema.js";

export const loadExampleOfflineEvaluationReport = (): OfflineEvaluationReport =>
  buildSyntheticOfflineEvaluationReport(
    validateRiskLossDesign(rawRiskLossDesign),
    validateOfflineScoreInputSet(rawOfflineScoreInputSet),
    validateOfflineSplitSimulation(rawOfflineSplitSimulation),
    validateOfflineThresholdSelection(rawOfflineThresholdSelection)
  );
