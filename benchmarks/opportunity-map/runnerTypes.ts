import { z } from "zod";
import { decisionPostureSchema } from "../../src/domain/decisions.js";
import {
  uncertaintyLevelSchema,
  uncertaintyReductionStepKindSchema
} from "../../src/uncertainty/uncertaintyTypes.js";
import {
  opportunityCategoryIdSchema,
  opportunityFixtureIdSchema,
  opportunityProblemFamilies,
  opportunityProblemFamilySchema,
  opportunityScenarioIdSchema
} from "./scenarioSchema.js";

export const opportunityBenchmarkRunSchemaVersion =
  "opportunity-benchmark-run.v1" as const;

export const opportunityBenchmarkRunOptionsSchema = z.object({
  scenarioIds: z.array(opportunityScenarioIdSchema).optional(),
  problemFamilies: z.array(opportunityProblemFamilySchema).optional(),
  includeDetails: z.boolean().optional()
});

export type OpportunityBenchmarkRunOptions = z.infer<
  typeof opportunityBenchmarkRunOptionsSchema
>;

export const opportunityBenchmarkScenarioResultSchema = z.object({
  scenarioId: opportunityScenarioIdSchema,
  problemFamily: opportunityProblemFamilySchema,
  fixtureRefs: z.array(opportunityFixtureIdSchema),
  passed: z.boolean(),
  expected: z.object({
    advisoryRouterDecision: decisionPostureSchema,
    uncertaintyDrivers: z.array(opportunityCategoryIdSchema),
    reductionStepKinds: z.array(uncertaintyReductionStepKindSchema).optional()
  }),
  actual: z.object({
    advisoryRouterDecision: decisionPostureSchema,
    uncertaintyDrivers: z.array(opportunityCategoryIdSchema),
    reductionStepKinds: z.array(uncertaintyReductionStepKindSchema),
    topDrivers: z.array(opportunityCategoryIdSchema),
    overallLevel: uncertaintyLevelSchema
  }),
  checks: z.object({
    advisoryDecisionMatch: z.boolean(),
    expectedDriversPresent: z.boolean(),
    expectedReductionStepsPresent: z.boolean()
  })
});

export type OpportunityBenchmarkScenarioResult = z.infer<
  typeof opportunityBenchmarkScenarioResultSchema
>;

export const opportunityBenchmarkRunResultSchema = z.object({
  schemaVersion: z.literal(opportunityBenchmarkRunSchemaVersion),
  totalScenarios: z.number().int().nonnegative(),
  passedScenarios: z.number().int().nonnegative(),
  failedScenarios: z.number().int().nonnegative(),
  skippedScenarios: z.number().int().nonnegative(),
  results: z.array(opportunityBenchmarkScenarioResultSchema),
  coverage: z.object({
    problemFamiliesCovered: z.array(opportunityProblemFamilySchema),
    scenarioCountByFamily: z.object(
      Object.fromEntries(
        opportunityProblemFamilies.map((family) => [
          family,
          z.number().int().nonnegative()
        ])
      ) as Record<(typeof opportunityProblemFamilies)[number], z.ZodNumber>
    )
  }),
  safety: z.object({
    executedCommands: z.literal(false),
    requiredNetwork: z.literal(false),
    mutatedRepository: z.literal(false),
    touchedRealSecrets: z.literal(false)
  })
});

export type OpportunityBenchmarkRunResult = z.infer<
  typeof opportunityBenchmarkRunResultSchema
>;
