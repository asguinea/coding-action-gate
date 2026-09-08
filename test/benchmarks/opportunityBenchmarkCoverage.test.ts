import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  opportunityProblemFamilies,
  scenarioContainsForbiddenRawString,
  validateOpportunityBenchmarkScenario,
  type OpportunityBenchmarkScenario
} from "../../benchmarks/opportunity-map/scenarioSchema.js";
import { uncertaintyReductionStepKinds } from "../../src/uncertainty/uncertaintyTypes.js";

const scenariosRoot = path.join(
  process.cwd(),
  "benchmarks",
  "opportunity-map",
  "scenarios"
);

const knownDriverIds = new Set([
  "action_scope_too_broad",
  "autonomy_budget_unknown",
  "command_risk_critical",
  "deploy_target_ambiguous",
  "delegated_action_provenance_unknown",
  "deployment_command_detected",
  "destructive_command_detected",
  "destructive_file_change_detected",
  "destructive_operation_recovery_unknown",
  "direct_mainline_risk",
  "environment_risk_critical",
  "environment_unknown",
  "force_push_detected",
  "landing_action_detected",
  "no_net_progress_detected",
  "overwrite_operation_detected",
  "production_environment_detected",
  "protected_branch_risk",
  "provenance_unknown",
  "provenance_untrusted",
  "recovery_checkpoint_missing",
  "recovery_state_unknown",
  "repeated_defer_detected",
  "retry_budget_exceeded",
  "rollback_confidence_unknown",
  "secret_material_detected",
  "secret_path_detected",
  "secret_pattern_detected",
  "sensitive_change_review_required",
  "sensitive_context_missing",
  "sensitive_path_detected",
  "target_file_hash_changed",
  "target_file_not_observed",
  "target_file_stale",
  "validation_failed",
  "validation_missing",
  "workspace_boundary_violation",
  "workspace_recovery_boundary_unknown"
]);

const categoryIdPattern = /^[a-z][a-z0-9_]*$/;

const scenarioFiles = async (directory = scenariosRoot): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await scenarioFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files.sort();
};

const loadScenarios = async (): Promise<OpportunityBenchmarkScenario[]> => {
  const scenarios: OpportunityBenchmarkScenario[] = [];

  for (const file of await scenarioFiles()) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];

    scenarios.push(...entries.map(validateOpportunityBenchmarkScenario));
  }

  return scenarios.sort((left, right) => left.id.localeCompare(right.id));
};

describe("Opportunity Benchmark scenario coverage", () => {
  it("covers every Opportunity Map problem family with at least two scenarios", async () => {
    const scenarios = await loadScenarios();
    const counts = new Map<string, number>();

    for (const scenario of scenarios) {
      counts.set(
        scenario.problemFamily,
        (counts.get(scenario.problemFamily) ?? 0) + 1
      );
    }

    expect(scenarios).toHaveLength(20);

    for (const family of opportunityProblemFamilies) {
      expect(counts.get(family)).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every scenario inert, local, and non-mutating", async () => {
    for (const scenario of await loadScenarios()) {
      expect(scenario.safety.inert).toBe(true);
      expect(scenario.safety.executesCommands).toBe(false);
      expect(scenario.safety.touchesRealSecrets).toBe(false);
      expect(scenario.safety.requiresNetwork).toBe(false);
      expect(scenario.safety.mutatesRepository).toBe(false);
    }
  });

  it("uses stable driver IDs and stable reduction step kinds", async () => {
    const knownStepKinds = new Set(uncertaintyReductionStepKinds);

    for (const scenario of await loadScenarios()) {
      const driverFields = [
        scenario.expected.uncertaintyDrivers,
        scenario.expected.hardBlockDrivers ?? [],
        scenario.expected.escalationDrivers ?? [],
        scenario.expected.deferDrivers ?? []
      ].flat();

      for (const driver of driverFields) {
        expect(driver).toMatch(categoryIdPattern);
        expect(knownDriverIds.has(driver)).toBe(true);
      }

      for (const stepKind of scenario.expected.reductionStepKinds ?? []) {
        expect(stepKind).toMatch(categoryIdPattern);
        expect(knownStepKinds.has(stepKind)).toBe(true);
      }
    }
  });

  it("does not include forbidden raw private values or executable script-like content", async () => {
    for (const scenario of await loadScenarios()) {
      const serialized = JSON.stringify(scenario);

      expect(scenarioContainsForbiddenRawString(scenario)).toBe(false);
      expect(serialized).not.toContain("/Users/");
      expect(serialized).not.toContain("C:\\");
      expect(serialized).not.toContain("/tmp/private");
      expect(serialized).not.toContain("API_KEY=");
      expect(serialized).not.toContain("SECRET=");
      expect(serialized).not.toContain("TOKEN=");
      expect(serialized).not.toContain("PRIVATE_KEY");
      expect(serialized).not.toContain("diff --git");
      expect(serialized).not.toContain("http://");
      expect(serialized).not.toContain("https://");
      expect(serialized).not.toContain("api.internal.customer.local");
      expect(serialized).not.toContain("feature/customer-prod");
    }
  });
});
