import { z } from "zod";

export const riskLevelSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
  "unknown"
]);

export const secretTouchSchema = z.enum([
  "none",
  "possible",
  "probable",
  "confirmed",
  "unknown"
]);

export const fileFreshnessSchema = z.enum([
  "fresh",
  "stale",
  "unknown",
  "missing"
]);

export const validationStatusSchema = z.enum([
  "not_run",
  "running",
  "passed",
  "failed",
  "stale",
  "unknown"
]);

export const environmentClassificationSchema = z.enum([
  "dev",
  "staging",
  "production",
  "unknown"
]);

export const autonomyBudgetStatusSchema = z.enum([
  "ok",
  "warning",
  "exceeded",
  "unknown"
]);

export const delegationProvenanceSchema = z.enum([
  "trusted",
  "partial",
  "untrusted",
  "unknown"
]);

export const workspaceBoundaryStatusSchema = z.enum([
  "inside",
  "outside",
  "unknown",
  "not_applicable"
]);

export const stepHarborSignalsSchema = z.object({
  pathSensitivity: riskLevelSchema.optional(),
  pathSensitivityReason: z.string().min(1).optional(),
  matchedSensitivePath: z.string().min(1).optional(),
  matchedSensitivePathLevel: z.enum(["medium", "high", "critical"]).optional(),
  sensitivePathMatches: z
    .array(
      z.object({
        path: z.string().min(1),
        pattern: z.string().min(1),
        level: z.enum(["medium", "high", "critical"])
      })
    )
    .optional(),
  commandRiskScore: riskLevelSchema.optional(),
  commandCategory: z.string().min(1).optional(),
  commandRiskReason: z.string().min(1).optional(),
  pipeToShell: z.boolean().optional(),
  downloadsRemoteCode: z.boolean().optional(),
  usesSudo: z.boolean().optional(),
  usesEval: z.boolean().optional(),
  forcePush: z.boolean().optional(),
  hookBypass: z.boolean().optional(),
  destructiveOperation: z.boolean().optional(),
  destructiveSubtype: z.string().min(1).optional(),
  destructiveSeverity: riskLevelSchema.optional(),
  destructiveReason: z.string().min(1).optional(),
  destructiveScore: z.number().min(0).max(1).optional(),
  mutatesFilesystem: z.boolean().optional(),
  mutatesGit: z.boolean().optional(),
  mutatesDatabase: z.boolean().optional(),
  mutatesCloud: z.boolean().optional(),
  networkExposure: z.boolean().optional(),
  externalUrlSource: z.string().min(1).optional(),
  workspaceBoundaryViolation: z.boolean().optional(),
  workspaceBoundaryStatus: workspaceBoundaryStatusSchema.optional(),
  workspaceBoundaryReason: z.string().min(1).optional(),
  secretTouch: secretTouchSchema.optional(),
  secretPathMatch: z.boolean().optional(),
  secretPatternMatch: z.boolean().optional(),
  entropyAnomaly: z.boolean().optional(),
  credentialFileType: z.string().min(1).optional(),
  outputRedactionRequired: z.boolean().optional(),
  commandContainsSecret: z.boolean().optional(),
  diffContainsSecret: z.boolean().optional(),
  promptContextContainsSecret: z.boolean().optional(),
  secretDetectionReason: z.string().min(1).optional(),
  matchedSecretPatterns: z.array(z.string().min(1)).optional(),
  targetFileReadRecently: z.boolean().optional(),
  fileChangedSinceRead: z.boolean().optional(),
  lastReadTimestamp: z.string().datetime({ offset: true }).optional(),
  lastReadHash: z.string().min(1).optional(),
  currentFileHash: z.string().min(1).optional(),
  readBeforeWriteReason: z.string().min(1).optional(),
  targetFileFreshness: fileFreshnessSchema.optional(),
  contextCompletenessScore: z.number().min(0).max(1).optional(),
  dependencyClosureScore: z.number().min(0).max(1).optional(),
  relatedTestsFound: z.boolean().optional(),
  relatedTestsRead: z.boolean().optional(),
  relatedTestPaths: z.array(z.string().min(1)).optional(),
  callersFound: z.boolean().optional(),
  callersRead: z.boolean().optional(),
  configRead: z.boolean().optional(),
  relatedContextReason: z.string().min(1).optional(),
  validationRequired: z.boolean().optional(),
  validationStatus: validationStatusSchema.optional(),
  validationAge: z.number().nonnegative().optional(),
  validationScope: z
    .enum(["before_commit", "before_push", "unknown"])
    .optional(),
  requiredValidationCommands: z.array(z.string().min(1)).optional(),
  latestValidationCommand: z.string().min(1).optional(),
  latestValidationKind: z
    .enum(["test", "lint", "typecheck", "build", "security", "other"])
    .optional(),
  latestValidationExitCode: z.number().int().optional(),
  validationPolicyMatch: z.string().min(1).optional(),
  validationReason: z.string().min(1).optional(),
  currentBranch: z.string().min(1).optional(),
  protectedBranch: z.boolean().optional(),
  upstreamBranch: z.string().min(1).optional(),
  remoteTarget: z.string().min(1).optional(),
  branchRisk: riskLevelSchema.optional(),
  isDetachedHead: z.boolean().optional(),
  isDirtyWorktree: z.boolean().optional(),
  hasUncommittedChanges: z.boolean().optional(),
  hasUntrackedFiles: z.boolean().optional(),
  repoIntegrityStatus: z
    .enum(["clean", "dirty", "not_git_repo", "unknown"])
    .optional(),
  gitCommandCategory: z.string().min(1).optional(),
  directMainlineCommit: z.boolean().optional(),
  directMainlinePush: z.boolean().optional(),
  requiredPrWorkflow: z.boolean().optional(),
  gitWorkflowReason: z.string().min(1).optional(),
  landingAction: z.boolean().optional(),
  landingActionType: z
    .enum([
      "commit",
      "push",
      "merge",
      "rebase",
      "deploy",
      "release",
      "publish",
      "unknown_landing"
    ])
    .optional(),
  landingRisk: riskLevelSchema.optional(),
  landingReason: z.string().min(1).optional(),
  requiresValidation: z.boolean().optional(),
  requiresCleanWorktree: z.boolean().optional(),
  requiresHumanApproval: z.boolean().optional(),
  deploymentRisk: riskLevelSchema.optional(),
  releaseRisk: riskLevelSchema.optional(),
  environmentClassification: environmentClassificationSchema.optional(),
  autonomyBudgetStatus: autonomyBudgetStatusSchema.optional(),
  delegationProvenance: delegationProvenanceSchema.optional()
});

export type StepHarborSignals = z.infer<typeof stepHarborSignalsSchema>;
