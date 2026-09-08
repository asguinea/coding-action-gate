import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
const python = process.env.PYTHON ?? "python3";
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    timeout: 300_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? result.signal}).`);
};
run(process.execPath, [
  "node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.reproduce.json"
]);
run(process.execPath, [".reproduction-build/scripts/reproduce-benchmark.js"]);
run(python, [
  "-m",
  "unittest",
  "discover",
  "-s",
  "research/risk_controlled_intervention/tests"
]);
run(python, [
  "research/risk_controlled_intervention/scripts/evaluate_T17_synthetic_theorem_demonstration.py"
]);
await mkdir("reproduction", { recursive: true });
const reports = "research/risk_controlled_intervention/reports";
await copyFile(
  `${reports}/batch_T17_synthetic_theorem_demo.csv`,
  "reproduction/controller-results.csv"
);
const summary = JSON.parse(
  await readFile(`${reports}/batch_T17_synthetic_theorem_demo.json`, "utf8")
);
assert.equal(summary.scenario_count, 8);
assert.equal(summary.rows, 2400);
// Wall-clock timestamps are provenance, not numerical results.
delete summary.generated_at;
await writeFile(
  "reproduction/controller-summary.json",
  `${JSON.stringify(summary, null, 2)}\n`
);
run(python, ["scripts/canonicalize-controller.py"]);
const outputs = [
  "benchmark-metrics.json",
  "controller-results.canonical.csv",
  "controller-summary.json"
];
const hashes = {};
for (const name of outputs) {
  hashes[name] = createHash("sha256")
    .update(await readFile(`reproduction/${name}`))
    .digest("hex");
}
const expected = JSON.parse(
  await readFile("scripts/reproduction-reference.json", "utf8")
);
assert.deepEqual(
  hashes,
  expected,
  "Numerical outputs differ from the reference; inspect the changes before updating it."
);
await writeFile(
  "reproduction/checksums.json",
  `${JSON.stringify(hashes, null, 2)}\n`
);
console.log(
  "Reproduction verified: benchmark and 2,400 seeded controller evaluations match the reference."
);
