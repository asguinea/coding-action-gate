import path from "node:path";
import type { NormalizedCodingActionGateAction } from "../../actions/actionErrors.js";
import { buildReadBeforeWriteSignals } from "../../context/readBeforeWriteSignals.js";
import type { ReadBeforeWriteFreshnessInput } from "../../context/readBeforeWriteTypes.js";
import { checkFileFreshness } from "../../observations/fileFreshness.js";
import { collectClassifiablePaths } from "../../paths/pathSensitivityClassifier.js";
import { classifySecretPath } from "../../secrets/secretPathClassifier.js";
import type { SafetySignalDetector } from "./baseDetector.js";

const mutatingFileActionTypes = new Set<
  NormalizedCodingActionGateAction["type"]
>(["edit_file", "write_file", "delete_file"]);

const isMutatingFileAction = (
  action: NormalizedCodingActionGateAction
): boolean => mutatingFileActionTypes.has(action.type);

const collectMutationTargets = (
  action: NormalizedCodingActionGateAction
): string[] => collectClassifiablePaths(action);

const secretSkippedFreshness = (
  targetPath: string,
  cwd: string
): ReadBeforeWriteFreshnessInput => ({
  path: targetPath,
  absolutePath: path.isAbsolute(targetPath)
    ? path.normalize(targetPath)
    : path.resolve(cwd, targetPath),
  status: "unknown",
  reason: "Secret path freshness is not checked automatically.",
  secretSkipped: true
});

export const readBeforeWriteDetector: SafetySignalDetector = {
  id: "read-before-write",
  async compute({ action, context }) {
    if (!isMutatingFileAction(action)) {
      return {};
    }

    const cwd = context?.cwd ?? process.cwd();
    const sessionId = context?.session?.sessionId ?? "default";
    const targets = collectMutationTargets(action);

    if (targets.length === 0) {
      return {
        targetFileReadRecently: false,
        targetFileFreshness: "unknown",
        readBeforeWriteReason:
          "No mutation targets were available for freshness checks."
      };
    }

    const freshnessResults = await Promise.all(
      targets.map(async (targetPath) => {
        if (classifySecretPath(targetPath) !== undefined) {
          return secretSkippedFreshness(targetPath, cwd);
        }

        return checkFileFreshness({
          path: targetPath,
          cwd,
          sessionId,
          ...(context?.observationDir !== undefined
            ? { observationDir: context.observationDir }
            : {})
        });
      })
    );

    return buildReadBeforeWriteSignals(freshnessResults);
  }
};
