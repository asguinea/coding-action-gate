import rawCalibrationManifest from "./example-calibration-manifest.json" with { type: "json" };
import rawCalibrationRecords from "./example-calibration-records.json" with { type: "json" };
import rawLabelCompletenessReport from "./example-label-completeness-report.json" with { type: "json" };
import { validateCalibrationManifest } from "./calibrationManifestSchema.js";
import { validateCalibrationRecords } from "./calibrationDatasetSchema.js";
import { validateLabelCompletenessReport } from "./labelCompletenessSchema.js";
import {
  buildSyntheticSplitPlanningReport,
  type SplitPlanningReport
} from "./splitPlanningSchema.js";

export const loadExampleSplitPlanningReport = (): SplitPlanningReport =>
  buildSyntheticSplitPlanningReport({
    reportId: "calibration-split-planning-synthetic-report-001",
    records: validateCalibrationRecords(rawCalibrationRecords),
    manifest: validateCalibrationManifest(rawCalibrationManifest),
    labelCompletenessReport: validateLabelCompletenessReport(
      rawLabelCompletenessReport
    )
  });
