import rawCalibrationManifest from "./example-calibration-manifest.json" with { type: "json" };
import rawCalibrationRecords from "./example-calibration-records.json" with { type: "json" };
import { validateCalibrationManifest } from "./calibrationManifestSchema.js";
import { validateCalibrationRecords } from "./calibrationDatasetSchema.js";
import {
  buildSyntheticLabelCompletenessReport,
  type LabelCompletenessReport
} from "./labelCompletenessSchema.js";

export const loadExampleLabelCompletenessReport = (): LabelCompletenessReport =>
  buildSyntheticLabelCompletenessReport({
    reportId: "calibration-label-completeness-synthetic-report-001",
    records: validateCalibrationRecords(rawCalibrationRecords),
    manifest: validateCalibrationManifest(rawCalibrationManifest)
  });
