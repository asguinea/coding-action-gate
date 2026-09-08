import { actionMetadataDetector } from "./actionMetadataDetector.js";
import { commandRiskDetector } from "./commandRiskDetector.js";
import { destructiveActionDetector } from "./destructiveActionDetector.js";
import { gitWorkflowDetector } from "./gitWorkflowDetector.js";
import { landingGateDetector } from "./landingGateDetector.js";
import { readBeforeWriteDetector } from "./readBeforeWriteDetector.js";
import { relatedContextDetector } from "./relatedContextDetector.js";
import { secretDetector } from "./secretDetector.js";
import { sensitivePathDetector } from "./sensitivePathDetector.js";
import { validationGateDetector } from "./validationGateDetector.js";
import { workspaceBoundaryDetector } from "./workspaceBoundaryDetector.js";
import type {
  SafetySignalDetector,
  SafetySignalDetectorResult
} from "./baseDetector.js";

export const defaultSafetySignalDetectors: SafetySignalDetector[] = [
  actionMetadataDetector,
  destructiveActionDetector,
  workspaceBoundaryDetector,
  sensitivePathDetector,
  secretDetector,
  readBeforeWriteDetector,
  relatedContextDetector,
  gitWorkflowDetector,
  validationGateDetector,
  commandRiskDetector,
  landingGateDetector
];

export {
  actionMetadataDetector,
  commandRiskDetector,
  destructiveActionDetector,
  gitWorkflowDetector,
  landingGateDetector,
  readBeforeWriteDetector,
  relatedContextDetector,
  secretDetector,
  sensitivePathDetector,
  validationGateDetector,
  workspaceBoundaryDetector
};
export type { SafetySignalDetector, SafetySignalDetectorResult };
