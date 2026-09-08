import { readdir, readFile, stat, lstat, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignored = new Set([
  ".git",
  "node_modules",
  "dist",
  ".venv",
  "__pycache__",
  "coverage",
  ".coding-action-gate",
  "reproduction",
  ".reproduction-build",
  "workdir"
]);
const errors = [];
const files = [];
// Ignored local outputs are expected during development, but must never be
// force-added to the source repository.
const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: root,
  encoding: "utf8"
});
if (gitRoot.status === 0 && path.resolve(gitRoot.stdout.trim()) === root) {
  const index = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8"
  });
  if (index.status !== 0)
    throw new Error("Could not inspect tracked release files");
  for (const tracked of index.stdout.split("\0").filter(Boolean)) {
    if (
      tracked.split("/").some((part) => ignored.has(part)) ||
      tracked.startsWith("research/risk_controlled_intervention/data/") ||
      tracked.startsWith(
        "research/risk_controlled_intervention/theory_evaluation_artifacts/"
      ) ||
      (tracked.startsWith("research/risk_controlled_intervention/reports/") &&
        !tracked.endsWith("/model_score_schema.json"))
    )
      errors.push(`Generated or private state is tracked: ${tracked}`);
  }
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    const relative = path.relative(root, full).split(path.sep).join("/");
    if (relative.startsWith("research/risk_controlled_intervention/data/"))
      continue;
    if (
      relative.startsWith(
        "research/risk_controlled_intervention/theory_evaluation_artifacts/"
      )
    )
      continue;
    if (
      relative.startsWith("research/risk_controlled_intervention/reports/") &&
      entry.name !== "model_score_schema.json"
    )
      continue;
    if (entry.isSymbolicLink()) {
      errors.push(`Symlink requires review: ${relative}`);
      continue;
    }
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    files.push(relative);
    const info = await stat(full);
    if (info.size > 5 * 1024 * 1024)
      errors.push(`Source file exceeds 5 MiB: ${relative}`);
    if (
      /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|tgz|zst))$/.test(entry.name) &&
      entry.name !== ".env.example"
    )
      errors.push(`Sensitive or generated file: ${relative}`);
    if (relative.endsWith(".md")) {
      const text = await readFile(full, "utf8");
      for (const match of text.matchAll(
        /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
      )) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z]+:|^\/\//i.test(target)) continue;
        const resolved = path.resolve(
          path.dirname(full),
          decodeURIComponent(target)
        );
        if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root)
          errors.push(`Link escapes repository: ${relative} → ${target}`);
        else {
          try {
            await access(resolved);
          } catch {
            errors.push(`Broken link: ${relative} → ${target}`);
          }
        }
      }
    }
  }
}
await walk(root);
const metadata = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
);
for (const file of [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/reproducibility.md"
]) {
  if (!files.includes(file))
    errors.push(`Missing release documentation: ${file}`);
}
if (!metadata.private)
  errors.push(
    "Package publication must remain disabled until a package release is prepared."
  );
const referenceDir = path.join(
  root,
  "research/risk_controlled_intervention/reference-data"
);
const inputs = JSON.parse(
  await readFile(path.join(referenceDir, "manifest.json"), "utf8")
);
for (const input of inputs) {
  if (path.basename(input.file) !== input.file)
    throw new Error("Invalid reference-data path");
  const digest = createHash("sha256")
    .update(await readFile(path.join(referenceDir, input.file)))
    .digest("hex");
  if (digest !== input.sha256)
    errors.push(`Reference input changed: ${input.file}`);
}
if (process.argv.includes("--publication")) {
  if (!metadata.license || metadata.license === "UNLICENSED")
    errors.push("Choose and apply the release license.");
  try {
    await lstat(path.join(root, "LICENSE"));
  } catch {
    errors.push("Missing LICENSE file.");
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Release content checked: ${files.length} source files; links and reference inputs verified.`
  );
