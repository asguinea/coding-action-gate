import rawCalibrationManifest from "./example-calibration-manifest.json" with { type: "json" };
import rawCalibrationRecords from "./example-calibration-records.json" with { type: "json" };
import rawLabelCompletenessReport from "./example-label-completeness-report.json" with { type: "json" };
import rawSplitPlanningReport from "./example-split-planning-report.json" with { type: "json" };
import { validateCalibrationRecords } from "./calibrationDatasetSchema.js";
import { validateCalibrationManifest } from "./calibrationManifestSchema.js";
import { validateLabelCompletenessReport } from "./labelCompletenessSchema.js";
import { validateSplitPlanningReport } from "./splitPlanningSchema.js";
import {
  buildSyntheticCalibrationReadinessSummary,
  type CalibrationReadinessSummary
} from "./calibrationReadinessSchema.js";

export const loadExampleCalibrationReadinessSummary =
  (): CalibrationReadinessSummary =>
    buildSyntheticCalibrationReadinessSummary({
      readinessSummaryId: "phase-13-calibration-readiness-summary-001",
      records: validateCalibrationRecords(rawCalibrationRecords),
      manifest: validateCalibrationManifest(rawCalibrationManifest),
      labelCompletenessReport: validateLabelCompletenessReport(
        rawLabelCompletenessReport
      ),
      splitPlanningReport: validateSplitPlanningReport(rawSplitPlanningReport)
    });
