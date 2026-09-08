import { z } from "zod";
import {
  opportunityCategoryIdSchema,
  opportunityFixtureIdSchema,
  opportunityProblemFamilySchema,
  opportunityScenarioIdSchema
} from "./scenarioSchema.js";

export const opportunityBenchmarkFixtureSchemaVersion =
  "opportunity-benchmark-fixture.v1" as const;

export const opportunityBenchmarkFixtureSafetySchema = z.object({
  synthetic: z.literal(true),
  inert: z.literal(true),
  containsRealSecrets: z.literal(false),
  containsExecutableDangerousCommands: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false)
});

export const opportunityBenchmarkFixtureCategoriesSchema = z.object({
  hasSourceFiles: z.boolean().optional(),
  hasTests: z.boolean().optional(),
  hasPackageJson: z.boolean().optional(),
  hasGitMetadataSimulation: z.boolean().optional(),
  hasDeployConfigSimulation: z.boolean().optional(),
  hasSensitiveSurfaceSimulation: z.boolean().optional(),
  hasAutonomySimulation: z.boolean().optional(),
  hasProvenanceSimulation: z.boolean().optional()
});

export const opportunityBenchmarkFixtureSchema = z.object({
  schemaVersion: z.literal(opportunityBenchmarkFixtureSchemaVersion),
  id: opportunityFixtureIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  fixturePath: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_./-]+$/),
  supportedProblemFamilies: z.array(opportunityProblemFamilySchema).min(1),
  scenarioIds: z.array(opportunityScenarioIdSchema).min(1),
  safety: opportunityBenchmarkFixtureSafetySchema,
  categories: opportunityBenchmarkFixtureCategoriesSchema,
  categoryMarkers: z.array(opportunityCategoryIdSchema).optional()
});

export type OpportunityBenchmarkFixture = z.infer<
  typeof opportunityBenchmarkFixtureSchema
>;

export const validateOpportunityBenchmarkFixture = (
  fixture: unknown
): OpportunityBenchmarkFixture =>
  opportunityBenchmarkFixtureSchema.parse(fixture);

const forbiddenFixturePatterns = [
  /API_KEY=/,
  /SECRET=/,
  /TOKEN=/,
  /PRIVATE_KEY/,
  /-----BEGIN/,
  /sk_live/,
  /sk_test/,
  /password=/i,
  /npm publish/,
  /vercel deploy/,
  /--prod/,
  /rm\s+-rf/,
  /\bcurl\b/,
  /\bwget\b/,
  /\bsudo\b/,
  /chmod\s+-R/,
  /chown\s+-R/,
  /git push --force/,
  /git reset --hard/,
  /git clean -fdx/,
  /https?:\/\//,
  /\.internal\b/,
  /\/Users\//,
  /C:\\/,
  /\/tmp\/private/,
  /diff --git/
] as const;

export const fixtureContentContainsForbiddenRawString = (
  content: string
): boolean => forbiddenFixturePatterns.some((pattern) => pattern.test(content));

export const validateFixtureSafety = (
  fixture: OpportunityBenchmarkFixture
): void => {
  if (
    !fixture.safety.synthetic ||
    !fixture.safety.inert ||
    fixture.safety.containsRealSecrets ||
    fixture.safety.containsExecutableDangerousCommands ||
    fixture.safety.requiresNetwork ||
    fixture.safety.mutatesRepository
  ) {
    throw new Error(`Fixture safety flags are not safe: ${fixture.id}`);
  }
};
