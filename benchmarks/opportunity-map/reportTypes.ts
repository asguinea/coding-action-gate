import { z } from "zod";
import { decisionPostureSchema } from "../../src/domain/decisions.js";
import { uncertaintyReductionStepKindSchema } from "../../src/uncertainty/uncertaintyTypes.js";
import {
  opportunityCategoryIdSchema,
  opportunityProblemFamilySchema,
  opportunityScenarioIdSchema
} from "./scenarioSchema.js";

export const opportunityBenchmarkReportSchemaVersion =
  "opportunity-benchmark-report.v1" as const;

export const opportunityBenchmarkReportSummarySchema = z.object({
  scenarioCount: z.number().int().nonnegative(),
  passedScenarios: z.number().int().nonnegative(),
  failedScenarios: z.number().int().nonnegative(),
  advisoryDecisionMatchRate: z.number().min(0).max(1),
  uncertaintyDriverMatchRate: z.number().min(0).max(1),
  reductionStepMatchRate: z.number().min(0).max(1),
  problemFamiliesCovered: z.number().int().nonnegative(),
  unsafeExecutionCount: z.number().int().nonnegative(),
  privacyLeakCount: z.number().int().nonnegative()
});

export const opportunityBenchmarkEvidenceByFamilySchema = z.object({
  problemFamily: opportunityProblemFamilySchema,
  scenarioCount: z.number().int().nonnegative(),
  passedScenarios: z.number().int().nonnegative(),
  failedScenarios: z.number().int().nonnegative(),
  representativeScenarioIds: z.array(opportunityScenarioIdSchema),
  expectedPostures: z.array(decisionPostureSchema),
  keyExpectedDrivers: z.array(opportunityCategoryIdSchema),
  keyReductionSteps: z.array(uncertaintyReductionStepKindSchema)
});

export const opportunityBenchmarkReportSchema = z.object({
  schemaVersion: z.literal(opportunityBenchmarkReportSchemaVersion),
  generatedAt: z.string().datetime({ offset: true }).optional(),
  benchmark: z.object({
    scenarioSchemaVersion: z.literal("opportunity-benchmark-scenario.v1"),
    fixtureSchemaVersion: z.literal("opportunity-benchmark-fixture.v1"),
    runSchemaVersion: z.literal("opportunity-benchmark-run.v1"),
    metricsSchemaVersion: z.literal("opportunity-benchmark-metrics.v1")
  }),
  summary: opportunityBenchmarkReportSummarySchema,
  evidenceByFamily: z.array(opportunityBenchmarkEvidenceByFamilySchema),
  limitations: z.array(opportunityCategoryIdSchema),
  safety: z.object({
    syntheticInertScenarios: z.literal(true),
    executesCommands: z.literal(false),
    executesPackageScripts: z.literal(false),
    requiresNetwork: z.literal(false),
    mutatesRepository: z.literal(false),
    touchesRealSecrets: z.literal(false),
    productionRoutingAuthoritative: z.literal(false)
  })
});

export type OpportunityBenchmarkReport = z.infer<
  typeof opportunityBenchmarkReportSchema
>;

export interface CreateOpportunityBenchmarkReportOptions {
  generatedAt?: string;
}

export interface WrittenOpportunityBenchmarkReport {
  reportJsonPath: string;
  summaryMarkdownPath: string;
}
