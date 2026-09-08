import { mkdir, writeFile } from "node:fs/promises";
import {
  runOpportunityBenchmark,
  computeOpportunityBenchmarkMetrics
} from "../benchmarks/opportunity-map/index.js";

const run = await runOpportunityBenchmark();
const metrics = computeOpportunityBenchmarkMetrics(run);
await mkdir("reproduction", { recursive: true });
await writeFile(
  "reproduction/benchmark-metrics.json",
  `${JSON.stringify(metrics, null, 2)}\n`
);
if (metrics.failedScenarios > 0 || metrics.skippedScenarios > 0) {
  throw new Error(
    "The benchmark has failed or skipped scenarios; inspect reproduction/benchmark-metrics.json."
  );
}
console.log(
  `Benchmark: ${metrics.passedScenarios}/${metrics.scenarioCount} scenarios passed.`
);
