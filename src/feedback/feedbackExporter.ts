import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadPolicy } from "../policy/loadPolicy.js";
import { readAuditRecords } from "../uiAdapter/auditReader.js";
import { readDeferredActions } from "../uiAdapter/deferredReader.js";
import { readGitStateSummary } from "../uiAdapter/gitStateSummary.js";
import { readObservations } from "../uiAdapter/observationReader.js";
import { readValidationRecords } from "../uiAdapter/validationReader.js";
import { runDoctor } from "../doctor/doctorRunner.js";
import {
  finalizeFeedbackExport,
  hashFeedbackValue
} from "./feedbackSanitizer.js";
import {
  countDecisions,
  summarizeAuditRecord,
  summarizeDeferredAction,
  summarizeGitState,
  summarizePolicy,
  summarizeValidationRecord
} from "./feedbackSummaries.js";
import type {
  FeedbackBundle,
  FeedbackExportOptions,
  FeedbackExportResult
} from "./feedbackTypes.js";

export const defaultFeedbackLimit = 200;
export const maxFeedbackLimit = 1000;
export const stepharborFeedbackSchemaVersion = "0.1";
export const stepharborVersion = "0.1.0";

export const normalizeFeedbackLimit = (limit?: number): number => {
  const resolved = limit ?? defaultFeedbackLimit;

  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  return Math.min(resolved, maxFeedbackLimit);
};

export const buildDefaultFeedbackOutputPath = (date = new Date()): string => {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return path.resolve(`stepharbor-feedback-${timestamp}.json`);
};

const ensureOutputDoesNotExist = async (filePath: string): Promise<void> => {
  try {
    await stat(filePath);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT" || code === "ENOTDIR") {
      return;
    }

    throw error;
  }

  throw new Error(`Feedback output already exists: ${filePath}`);
};

const doctorForFeedback = async (
  options: FeedbackExportOptions,
  cwd: string
) => {
  const result = await runDoctor({
    cwd,
    ...(options.policy !== undefined ? { policy: options.policy } : {}),
    skipPortCheck: true
  });

  return {
    ok: result.ok,
    summary: result.summary,
    checks: result.checks.map((check) => ({
      id: check.id,
      status: check.status,
      message: check.message,
      ...(check.remediation !== undefined
        ? { remediation: check.remediation }
        : {})
    }))
  };
};

const observationCounts = (
  observations: Array<{ metadataOnly?: boolean | undefined }>
): FeedbackBundle["observations"] => ({
  count: observations.length,
  metadataOnlyCount: observations.filter(
    (observation) => observation.metadataOnly === true
  ).length,
  fullObservationCount: observations.filter(
    (observation) => observation.metadataOnly !== true
  ).length
});

export const buildFeedbackBundle = async (
  options: FeedbackExportOptions = {}
): Promise<FeedbackBundle> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const sessionId = options.sessionId ?? "default";
  const limit = normalizeFeedbackLimit(options.limit);
  const exportWarnings: string[] = [];

  const [auditRecords, deferredRecords, validationRecords, observations, git] =
    await Promise.all([
      readAuditRecords({
        cwd,
        ...(options.auditDir !== undefined
          ? { auditDir: options.auditDir }
          : {}),
        limit
      }),
      readDeferredActions({
        cwd,
        ...(options.deferDir !== undefined
          ? { deferDir: options.deferDir }
          : {}),
        sessionId,
        limit
      }),
      readValidationRecords({
        cwd,
        ...(options.validationDir !== undefined
          ? { validationDir: options.validationDir }
          : {}),
        sessionId,
        limit
      }),
      readObservations({
        cwd,
        ...(options.observationDir !== undefined
          ? { observationDir: options.observationDir }
          : {}),
        sessionId,
        limit
      }),
      readGitStateSummary({ cwd })
    ]);

  const loadedPolicy = await loadPolicy({
    cwd,
    ...(options.policy !== undefined ? { explicitPath: options.policy } : {})
  });

  if (!loadedPolicy.ok) {
    exportWarnings.push(
      `Policy could not be loaded: ${loadedPolicy.error.code}`
    );
  }

  const bundle: FeedbackBundle = {
    schemaVersion: stepharborFeedbackSchemaVersion,
    generatedAt: new Date().toISOString(),
    cwdHash: hashFeedbackValue(cwd),
    sessionId,
    redacted: true,
    environment: {
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      stepharborVersion
    },
    doctor: await doctorForFeedback(options, cwd),
    ...(loadedPolicy.ok
      ? { policy: summarizePolicy(loadedPolicy.policy, loadedPolicy.source) }
      : {}),
    decisions: {
      counts: countDecisions(auditRecords),
      records: auditRecords.map(summarizeAuditRecord)
    },
    deferred: {
      count: deferredRecords.length,
      records: deferredRecords.map(summarizeDeferredAction)
    },
    observations: observationCounts(observations),
    validation: {
      count: validationRecords.length,
      records: validationRecords.map(summarizeValidationRecord)
    },
    git: summarizeGitState(git),
    exportWarnings
  };

  return finalizeFeedbackExport(bundle);
};

export const exportFeedbackBundle = async (
  options: FeedbackExportOptions = {}
): Promise<FeedbackExportResult> => {
  const outPath =
    options.out !== undefined
      ? path.resolve(options.out)
      : buildDefaultFeedbackOutputPath();
  const limit = normalizeFeedbackLimit(options.limit);
  await ensureOutputDoesNotExist(outPath);
  await mkdir(path.dirname(outPath), { recursive: true });
  const bundle = await buildFeedbackBundle({
    ...options,
    limit
  });
  await writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });

  return {
    path: outPath,
    bundle,
    summary: {
      auditRecords: bundle.decisions.records.length,
      deferredActions: bundle.deferred.records.length,
      validationRecords: bundle.validation.records.length
    }
  };
};
