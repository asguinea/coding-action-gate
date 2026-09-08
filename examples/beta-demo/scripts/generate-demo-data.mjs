#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
export const betaDemoRoot = path.resolve(scriptDir, "..");
export const repoRoot = path.resolve(betaDemoRoot, "..", "..");
export const defaultWorkdir = path.join(betaDemoRoot, "workdir");
export const defaultSessionId = "beta-demo";
export const safeValidationCommand = 'node -e "process.exit(0)"';

const actionNames = {
  proceedReadme: "proceed-readme-edit.json",
  deferService: "defer-service-edit.json",
  escalateAuth: "escalate-auth-edit.json",
  blockSecret: "block-secret-read.json",
  landingProdDeploy: "landing-prod-deploy.json"
};

const usage = `Usage:
  node examples/beta-demo/scripts/generate-demo-data.mjs [--out <path>] [--clean]

Options:
  --out <path>   Output workdir. Default: examples/beta-demo/workdir
  --clean        Reset the output workdir before generating data. Default for the built-in workdir.
  --help         Show this help.
`;

const exists = async (filePath) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const parseDemoArgs = (args) => {
  const result = {
    outDir: defaultWorkdir,
    clean: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      return {
        help: true,
        ...result
      };
    }

    if (arg === "--clean") {
      result.clean = true;
      continue;
    }

    if (arg === "--out") {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for --out.");
      }

      result.outDir = path.resolve(value);
      result.clean = true;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
};

export const getDemoPaths = (outDir = defaultWorkdir) => ({
  workdir: path.resolve(outDir),
  repoFixtureDir: path.join(betaDemoRoot, "repo"),
  actionDir: path.join(betaDemoRoot, "actions"),
  policyPath: path.join(betaDemoRoot, "policies", "beta-demo.policy.yml"),
  cliPath: path.join(repoRoot, "dist", "cli", "cli.js")
});

export const ensureBuiltCli = async (cliPath) => {
  if (!(await exists(cliPath))) {
    throw new Error("Run npm run build and npm run ui:build first.");
  }
};

const assertSafeCleanTarget = (workdir) => {
  const resolved = path.resolve(workdir);
  const relativeToDemoRoot = path.relative(betaDemoRoot, resolved);
  const relativeToTemp = path.relative(os.tmpdir(), resolved);
  const isUnderDemoRoot =
    relativeToDemoRoot.length > 0 &&
    !relativeToDemoRoot.startsWith("..") &&
    !path.isAbsolute(relativeToDemoRoot);
  const isUnderTemp =
    relativeToTemp.length > 0 &&
    !relativeToTemp.startsWith("..") &&
    !path.isAbsolute(relativeToTemp);

  if (!isUnderDemoRoot && !isUnderTemp) {
    throw new Error(
      "Refusing to clean output outside examples/beta-demo or the system temp directory."
    );
  }
};

const runProcess = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      const allowedExitCodes = options.allowedExitCodes ?? [0];

      if (!allowedExitCodes.includes(exitCode ?? 1)) {
        reject(
          new Error(
            `${file} ${args.join(" ")} failed with exit code ${exitCode}\n${stderr}`
          )
        );
        return;
      }

      resolve({
        exitCode,
        stdout,
        stderr
      });
    });
  });

const runGit = async (args, workdir) => {
  await runProcess("git", args, {
    cwd: workdir
  });
};

const runStepHarbor = async (cliPath, args, workdir, allowedExitCodes) => {
  const result = await runProcess(process.execPath, [cliPath, ...args], {
    cwd: workdir,
    allowedExitCodes
  });

  return JSON.parse(result.stdout);
};

const actionPath = (actionDir, name) => path.join(actionDir, name);

const copyRepoFixture = async (paths, clean) => {
  if (clean) {
    assertSafeCleanTarget(paths.workdir);
    await rm(paths.workdir, {
      recursive: true,
      force: true
    });
  }

  await mkdir(paths.workdir, {
    recursive: true
  });
  await cp(paths.repoFixtureDir, paths.workdir, {
    recursive: true,
    force: true
  });
  await writeFile(
    path.join(paths.workdir, ".env"),
    "STEPHARBOR_FAKE_DEMO_TOKEN=sk-abcdefghijklmnopqrstuvwxyz1234567890\n",
    "utf8"
  );
  await writeFile(path.join(paths.workdir, ".gitignore"), ".stepharbor/\n", "utf8");
};

const initializeGitRepo = async (workdir) => {
  await runGit(["init", "-b", "feature/beta-demo"], workdir);
  await runGit(["config", "user.email", "stepharbor-demo@example.test"], workdir);
  await runGit(["config", "user.name", "StepHarbor Beta Demo"], workdir);
  await runGit(["add", "README.md", "src/service.ts", "src/service.test.ts", "auth/service.ts", ".gitignore"], workdir);
  await runGit(["commit", "-m", "initial beta demo fixture"], workdir);
};

const commonArgs = (paths) => [
  "--cwd",
  paths.workdir,
  "--policy",
  paths.policyPath,
  "--session-id",
  defaultSessionId,
  "--json"
];

export const generateDemoData = async (input = {}) => {
  const paths = getDemoPaths(input.outDir ?? defaultWorkdir);
  const clean = input.clean ?? true;

  await ensureBuiltCli(paths.cliPath);
  await copyRepoFixture(paths, clean);
  await initializeGitRepo(paths.workdir);

  const base = commonArgs(paths);

  const steps = [];
  const runStep = async (label, args, allowedExitCodes) => {
    const output = await runStepHarbor(paths.cliPath, args, paths.workdir, allowedExitCodes);
    steps.push({
      label,
      decision: output.decision?.decision,
      deferredActionId: output.deferredAction?.id,
      validationStatus: output.validation?.status
    });
    return output;
  };

  await runStep("read README.md", ["read", "README.md", ...base], [0]);
  await runStep(
    "decide README edit after read",
    ["decide", actionPath(paths.actionDir, actionNames.proceedReadme), ...base],
    [0]
  );

  const deferred = await runStep(
    "decide service edit before reads",
    ["decide", actionPath(paths.actionDir, actionNames.deferService), ...base],
    [2]
  );
  const deferredActionId = deferred.deferredAction?.id;

  await runStep("read src/service.ts", ["read", "src/service.ts", ...base], [0]);

  if (typeof deferredActionId === "string") {
    await runStep(
      "retry service edit before related tests",
      ["retry", deferredActionId, ...base],
      [0, 2, 3, 4]
    );
  }

  await runStep("read src/service.test.ts", ["read", "src/service.test.ts", ...base], [0]);

  if (typeof deferredActionId === "string") {
    await runStep(
      "retry service edit after related tests",
      ["retry", deferredActionId, ...base],
      [0, 2, 3, 4]
    );
  }

  await runStep("read auth/service.ts", ["read", "auth/service.ts", ...base], [0]);
  await runStep(
    "decide auth edit after read",
    ["decide", actionPath(paths.actionDir, actionNames.escalateAuth), ...base],
    [3]
  );
  await runStep(
    "decide .env read",
    ["decide", actionPath(paths.actionDir, actionNames.blockSecret), ...base],
    [4]
  );

  await runStep(
    "stepharbor exec rm -rf . dry-run",
    ["exec", "rm -rf .", ...base],
    [4]
  );
  await runStep(
    "git commit before validation dry-run",
    ["exec", "git commit -m test", ...base],
    [2, 3, 4]
  );
  await runStep(
    "validate safe command",
    ["validate", "other", "--command", safeValidationCommand, ...base],
    [0]
  );
  await runStep(
    "git commit after validation dry-run",
    ["exec", "git commit -m test", ...base],
    [0, 3]
  );
  await runStep(
    "production deploy dry-run",
    ["exec", "vercel deploy --prod", ...base],
    [4]
  );
  await runStep(
    "decide production deploy fixture",
    ["decide", actionPath(paths.actionDir, actionNames.landingProdDeploy), ...base],
    [4]
  );

  return {
    paths,
    steps,
    deferredActionId
  };
};

const printSummary = (result) => {
  console.log("StepHarbor beta demo data generated.");
  console.log("");
  console.log(`Workdir: ${result.paths.workdir}`);
  console.log(`Session: ${defaultSessionId}`);
  console.log("");
  console.log("Generated decisions:");

  for (const step of result.steps) {
    const details = [
      step.decision,
      step.validationStatus !== undefined ? `validation=${step.validationStatus}` : undefined,
      step.deferredActionId !== undefined ? `deferred=${step.deferredActionId}` : undefined
    ].filter(Boolean);
    console.log(`- ${step.label}: ${details.join(", ")}`);
  }

  console.log("");
  console.log("Launch the beta UI:");
  console.log(`  node dist/cli/cli.js ui --cwd ${result.paths.workdir}`);
  console.log("");
  console.log("Or:");
  console.log(`  cd ${result.paths.workdir}`);
  console.log("  stepharbor ui");
};

const main = async () => {
  const parsed = parseDemoArgs(process.argv.slice(2));

  if (parsed.help === true) {
    console.log(usage);
    return;
  }

  const result = await generateDemoData({
    outDir: parsed.outDir,
    clean: parsed.clean
  });

  printSummary(result);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
