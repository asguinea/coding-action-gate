import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const packageName = packageJson.name;
const expectedVersion = `StepHarbor ${packageJson.version}`;

const excludedPackagePaths = [
  ".stepharbor/",
  "node_modules/",
  "coverage/",
  "dist/src/",
  "dist/package.json",
  "screenshots/",
  ".log",
  "examples/demo-video/recordings/",
  "examples/beta-demo/workdir/"
];

const requiredPackagePaths = [
  "dist/cli/cli.js",
  "dist/version.js",
  "ui/dist/index.html",
  "examples/actions/safe-readme-edit.json",
  "examples/policies/proceed-only.policy.yml",
  "docs/beta-install.md",
  "docs/first-run.md"
];

const execFileAsync = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: repoRoot,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
        windowsHide: true,
        ...options
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            Object.assign(error, {
              stdout: String(stdout),
              stderr: String(stderr),
              command: `${file} ${args.join(" ")}`
            })
          );
          return;
        }

        resolve({
          stdout: String(stdout),
          stderr: String(stderr)
        });
      }
    );
  });

const parsePackJson = (stdout) => {
  const jsonStart = stdout.indexOf("[");

  if (jsonStart < 0) {
    throw new Error(`npm pack did not return JSON:\n${stdout}`);
  }

  const parsed = JSON.parse(stdout.slice(jsonStart));
  const entry = parsed[0];

  if (entry === undefined) {
    throw new Error("npm pack returned an empty package report.");
  }

  return entry;
};

const formatBytes = (bytes) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
};

const assertPackageContents = (pack) => {
  const files = pack.files.map((file) => file.path);

  for (const requiredPath of requiredPackagePaths) {
    if (!files.includes(requiredPath)) {
      throw new Error(
        `Packed tarball is missing required file: ${requiredPath}`
      );
    }
  }

  for (const filePath of files) {
    for (const excludedPath of excludedPackagePaths) {
      if (filePath.includes(excludedPath)) {
        throw new Error(`Packed tarball contains excluded path: ${filePath}`);
      }
    }
  }

  if (pack.unpackedSize > 10 * 1024 * 1024) {
    console.warn(
      `Package unpacked size is above the beta sanity warning threshold: ${formatBytes(
        pack.unpackedSize
      )}`
    );
  }
};

const runCli = async (stepharborBin, args, options = {}) => {
  const result = await execFileAsync(stepharborBin, args, options);

  return result.stdout.trim();
};

let tempRoot;
let success = false;

try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "stepharbor-install-smoke-"));
  const packDir = path.join(tempRoot, "pack");
  const depPackDir = path.join(tempRoot, "dependency-packs");
  const installDir = path.join(tempRoot, "install");
  const projectDir = path.join(tempRoot, "project");
  const npmCacheDir = path.join(tempRoot, "npm-cache");
  await mkdir(packDir, { recursive: true });
  await mkdir(depPackDir, { recursive: true });
  await mkdir(installDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  await mkdir(npmCacheDir, { recursive: true });

  await execFileAsync("npm", ["run", "build"]);
  await execFileAsync("npm", ["run", "ui:build"]);

  const dryRun = await execFileAsync("npm", [
    "pack",
    "--dry-run",
    "--json",
    "--cache",
    npmCacheDir,
    "--pack-destination",
    packDir
  ]);
  const dryRunPack = parsePackJson(dryRun.stdout);
  assertPackageContents(dryRunPack);

  console.log(`Package size: ${formatBytes(dryRunPack.size)}`);
  console.log(`Package unpacked size: ${formatBytes(dryRunPack.unpackedSize)}`);
  console.log(`Package files: ${dryRunPack.files.length}`);

  const packResult = await execFileAsync("npm", [
    "pack",
    "--json",
    "--cache",
    npmCacheDir,
    "--pack-destination",
    packDir
  ]);
  const packed = parsePackJson(packResult.stdout);
  const tarballPath = path.join(packDir, packed.filename);

  await execFileAsync("npm", ["init", "-y", "--cache", npmCacheDir], {
    cwd: installDir
  });

  const dependencyTarballs = [];
  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    const packedDependency = await execFileAsync("npm", [
      "pack",
      `./node_modules/${dependencyName}`,
      "--json",
      "--cache",
      npmCacheDir,
      "--pack-destination",
      depPackDir
    ]);
    const dependencyPack = parsePackJson(packedDependency.stdout);
    dependencyTarballs.push(path.join(depPackDir, dependencyPack.filename));
  }

  await execFileAsync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--fund=false",
      "--offline",
      "--cache",
      npmCacheDir,
      tarballPath,
      ...dependencyTarballs
    ],
    { cwd: installDir }
  );

  await writeFile(
    path.join(projectDir, "README.md"),
    "# Smoke project\n",
    "utf8"
  );

  const stepharborBin = path.join(
    installDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "stepharbor.cmd" : "stepharbor"
  );
  const installedPackageRoot = path.join(
    installDir,
    "node_modules",
    packageName
  );
  const actionFile = path.join(
    installedPackageRoot,
    "examples",
    "actions",
    "safe-readme-edit.json"
  );
  const policyFile = path.join(
    installedPackageRoot,
    "examples",
    "policies",
    "proceed-only.policy.yml"
  );

  const versionOutput = await runCli(stepharborBin, ["--version"], {
    cwd: projectDir
  });
  const versionCommandOutput = await runCli(stepharborBin, ["version"], {
    cwd: projectDir
  });

  if (
    versionOutput !== expectedVersion ||
    versionCommandOutput !== expectedVersion
  ) {
    throw new Error(
      `Unexpected installed version output: ${versionOutput} / ${versionCommandOutput}`
    );
  }

  const helpOutput = await runCli(stepharborBin, ["--help"], {
    cwd: projectDir
  });
  if (!helpOutput.includes("stepharbor decide <actionFile>")) {
    throw new Error("Installed CLI help did not include decide command.");
  }

  const doctorOutput = await runCli(
    stepharborBin,
    ["doctor", "--cwd", projectDir],
    {
      cwd: projectDir
    }
  );
  if (!doctorOutput.includes("StepHarbor doctor")) {
    throw new Error("Installed doctor command did not print doctor output.");
  }

  const uiHelpOutput = await runCli(stepharborBin, ["ui", "--help"], {
    cwd: projectDir
  });
  if (!uiHelpOutput.includes("stepharbor ui [options]")) {
    throw new Error("Installed ui --help did not print UI help.");
  }

  const decisionOutput = await runCli(
    stepharborBin,
    [
      "decide",
      actionFile,
      "--policy",
      policyFile,
      "--cwd",
      projectDir,
      "--json",
      "--no-audit"
    ],
    { cwd: projectDir }
  );
  const decision = JSON.parse(decisionOutput);
  if (decision.decision?.decision !== "PROCEED") {
    throw new Error(
      `Expected smoke decision to PROCEED, got: ${decisionOutput}`
    );
  }

  console.log("Installed CLI smoke passed.");
  success = true;
} catch (error) {
  console.error("Installed CLI smoke failed.");
  if (error && typeof error === "object") {
    if ("command" in error) {
      console.error(`Command: ${error.command}`);
    }
    if ("stdout" in error && error.stdout) {
      console.error(`stdout:\n${error.stdout}`);
    }
    if ("stderr" in error && error.stderr) {
      console.error(`stderr:\n${error.stderr}`);
    }
  }
  console.error(error);
  if (tempRoot !== undefined) {
    console.error(`Preserved smoke directory for inspection: ${tempRoot}`);
  }
  process.exitCode = 1;
} finally {
  if (success && tempRoot !== undefined) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
