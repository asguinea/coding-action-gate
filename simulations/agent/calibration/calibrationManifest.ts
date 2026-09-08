import rawCalibrationRecords from "./example-calibration-records.json" with { type: "json" };
import { validateCalibrationRecords } from "./calibrationDatasetSchema.js";
import {
  buildSyntheticCalibrationManifest,
  type CalibrationManifest
} from "./calibrationManifestSchema.js";

export const loadExampleCalibrationManifest = (): CalibrationManifest =>
  buildSyntheticCalibrationManifest({
    manifestId: "calibration-synthetic-manifest-001",
    records: validateCalibrationRecords(rawCalibrationRecords)
  });
