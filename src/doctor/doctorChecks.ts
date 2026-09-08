import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveAuditLogPath } from "../audit/auditPaths.js";
import { runGitCommand } from "../git/gitExec.js";
import { getGitState } from "../git/gitStateReader.js";
import { loadPolicy } from "../policy/loadPolicy.js";
import { resolveStaticUiDistDir } from "../uiServer/staticUiServer.js";
import type { LoadedPolicyResult } from "../policy/policyErrors.js";
import type {
  DoctorCheck,
  DoctorOptions,
  DoctorSummary
} from "./doctorTypes.js";

const execFileAsync = promisify(execFile);

export const defaultDoctorApiPort = 17373;

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const cwdStat = async (
  cwd: string
): Promise<{ exists: true; isDirectory: boolean } | { exists: false }> => {
  try {
    const stats = await stat(cwd);

    return {
      exists: true,
      isDirectory: stats.isDirectory()
    };
  } catch {
    return {
      exists: false
    };
  }
};

const currentNodeMajor = (): number => {
  const major = Number(process.versions.node.split(".")[0]);

  return Number.isFinite(major) ? major : 0;
};

export const checkCwdExists = async (cwd: string): Promise<DoctorCheck> => {
  const stats = await cwdStat(cwd);

  if (!stats.exists) {
    return {
      id: "cwd-exists",
      label: "cwd exists",
      status: "fail",
      message: `Working directory does not exist: ${cwd}`,
      remediation: "Choose an existing project directory with --cwd."
    };
  }

  if (!stats.isDirectory) {
    return {
      id: "cwd-exists",
      label: "cwd exists",
      status: "fail",
      message: `Working directory is not a directory: ${cwd}`,
      remediation: "Choose a directory with --cwd."
    };
  }

  return {
    id: "cwd-exists",
    label: "cwd exists",
    status: "pass",
    message: `Working directory is available: ${cwd}`,
    details: {
      cwd
    }
  };
};

export const checkNodeVersion = async (): Promise<DoctorCheck> => {
  const version = process.versions.node;
  const major = currentNodeMajor();

  if (major >= 20) {
    return {
      id: "node-version",
      label: "Node version",
      status: "pass",
      message: `Node ${version} satisfies StepHarbor's supported runtime (>=20).`,
      details: {
        version,
        required: ">=20"
      }
    };
  }

  return {
    id: "node-version",
    label: "Node version",
    status: "fail",
    message: `Node ${version} is below StepHarbor's supported runtime (>=20).`,
    remediation: "Install Node.js 20 or newer.",
    details: {
      version,
      required: ">=20"
    }
  };
};

export const checkGitAvailable = async (): Promise<DoctorCheck> => {
  try {
    const result = await execFileAsync("git", ["--version"], {
      shell: false,
      windowsHide: true
    });
    const version = String(result.stdout).trim();

    return {
      id: "git-available",
      label: "git available",
      status: "pass",
      message: version.length > 0 ? version : "git is available.",
      details: {
        version
      }
    };
  } catch {
    return {
      id: "git-available",
      label: "git available",
      status: "warn",
      message: "git is not available on PATH.",
      remediation:
        "Install git or run StepHarbor in an environment with git available."
    };
  }
};

export const checkGitRepo = async (cwd: string): Promise<DoctorCheck> => {
  const state = await getGitState({ cwd });

  if (!state.isGitRepo) {
    return {
      id: "git-repo",
      label: "Git repository",
      status: "warn",
      message: "Working directory is not inside a Git repository.",
      remediation: "Run from a project Git repository for Git workflow checks.",
      details: {
        isGitRepo: false
      }
    };
  }

  return {
    id: "git-repo",
    label: "Git repository",
    status: "pass",
    message: `Git repository detected${state.currentBranch !== undefined ? ` on ${state.currentBranch}` : ""}.`,
    details: {
      isGitRepo: true,
      repoRoot: state.repoRoot,
      currentBranch: state.currentBranch,
      isDirty: state.isDirty
    }
  };
};

export const checkPolicyLoad = async (
  cwd: string,
  policy?: string
): Promise<{
  check: DoctorCheck;
  result?: LoadedPolicyResult;
}> => {
  const result = await loadPolicy({
    cwd,
    ...(policy !== undefined ? { explicitPath: policy } : {})
  });

  if (!result.ok) {
    return {
      result,
      check: {
        id: "policy-load",
        label: "Policy load",
        status: "fail",
        message: result.error.message,
        remediation:
          policy !== undefined
            ? "Fix the explicit policy path or policy file."
            : "Add a valid StepHarbor policy file or use the default policy.",
        details: {
          code: result.error.code,
          path: result.error.path
        }
      }
    };
  }

  if (result.source.type === "default") {
    return {
      result,
      check: {
        id: "policy-load",
        label: "Policy load",
        status: "warn",
        message: "No project policy discovered; default policy will be used.",
        remediation:
          "Add a StepHarbor policy file for project-specific behavior.",
        details: {
          source: result.source.type,
          version: result.policy.version
        }
      }
    };
  }

  return {
    result,
    check: {
      id: "policy-load",
      label: "Policy load",
      status: "pass",
      message: `${result.source.type} policy loaded.`,
      details: {
        source: result.source.type,
        path: result.source.path,
        version: result.policy.version
      }
    }
  };
};

export const checkRuntimeDirs = async (cwd: string): Promise<DoctorCheck> => {
  const dirPath = path.join(cwd, ".stepharbor");

  if (await fileExists(dirPath)) {
    return {
      id: "runtime-dirs",
      label: ".stepharbor runtime directory",
      status: "pass",
      message: ".stepharbor runtime directory exists.",
      details: {
        path: dirPath
      }
    };
  }

  return {
    id: "runtime-dirs",
    label: ".stepharbor runtime directory",
    status: "info",
    message: ".stepharbor runtime directory does not exist yet.",
    remediation:
      "Run StepHarbor commands or npm run demo:beta to generate runtime data.",
    details: {
      path: dirPath
    }
  };
};

export const checkAuditStore = async (cwd: string): Promise<DoctorCheck> => {
  const auditPath = resolveAuditLogPath({ cwd });

  if (await fileExists(auditPath)) {
    return {
      id: "audit-store",
      label: "Audit store",
      status: "pass",
      message: "Audit log exists.",
      details: {
        path: auditPath
      }
    };
  }

  return {
    id: "audit-store",
    label: "Audit store",
    status: "info",
    message: "No audit log found yet.",
    remediation:
      "Run stepharbor decide, exec, read, retry, or validate to write audit records.",
    details: {
      path: auditPath
    }
  };
};

export const checkUiBuild = async (
  rootCwd?: string,
  uiDistDir?: string
): Promise<DoctorCheck> => {
  const distDir =
    uiDistDir !== undefined
      ? path.resolve(uiDistDir)
      : resolveStaticUiDistDir(
          rootCwd !== undefined ? { cwd: rootCwd } : undefined
        );
  const indexPath = path.join(distDir, "index.html");

  if ((await fileExists(distDir)) && (await fileExists(indexPath))) {
    return {
      id: "ui-build",
      label: "UI build",
      status: "pass",
      message: "Built UI assets are available.",
      details: {
        path: distDir
      }
    };
  }

  return {
    id: "ui-build",
    label: "UI build",
    status: "warn",
    message: "UI build not found.",
    remediation: "Run npm run ui:build.",
    details: {
      path: distDir
    }
  };
};

const tryBindLocalPort = (port: number): Promise<"available" | "unavailable"> =>
  new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve("unavailable");
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve("available"));
    });
  });

export const checkApiPortAvailable = async (
  port: number
): Promise<DoctorCheck> => {
  const result = await tryBindLocalPort(port);

  if (result === "available") {
    return {
      id: "api-port-available",
      label: "API port available",
      status: "pass",
      message: `127.0.0.1:${port} is available for stepharbor ui.`,
      details: {
        host: "127.0.0.1",
        port
      }
    };
  }

  return {
    id: "api-port-available",
    label: "API port available",
    status: "warn",
    message: `127.0.0.1:${port} is already in use or cannot be bound.`,
    remediation:
      "Choose another port with --api-port when running stepharbor ui.",
    details: {
      host: "127.0.0.1",
      port
    }
  };
};

export const skippedApiPortCheck = (): DoctorCheck => ({
  id: "api-port-available",
  label: "API port available",
  status: "info",
  message: "API port availability check skipped.",
  details: {
    skipped: true
  }
});

export const checkStepHarborRuntime = async (): Promise<DoctorCheck> => {
  const version = await runGitCommand(["--version"]);

  return {
    id: "stepharbor-runtime",
    label: "StepHarbor command health",
    status: "pass",
    message: "StepHarbor doctor runtime is available.",
    details: {
      gitProbeAvailable: version.ok
    }
  };
};

export const checkStepHarborUiReady = (
  uiBuild: DoctorCheck,
  policy: DoctorCheck,
  cwd: DoctorCheck
): DoctorCheck => {
  const ready =
    cwd.status === "pass" &&
    uiBuild.status === "pass" &&
    policy.status !== "fail";

  if (ready) {
    return {
      id: "stepharbor-ui-ready",
      label: "StepHarbor UI ready",
      status: "pass",
      message: "StepHarbor UI can be launched for this project.",
      remediation: "Run `stepharbor ui --cwd .` to inspect local runtime state."
    };
  }

  return {
    id: "stepharbor-ui-ready",
    label: "StepHarbor UI ready",
    status: "warn",
    message: "StepHarbor UI is not fully ready yet.",
    remediation:
      "For source checkouts, run `npm run build && npm run ui:build`; for installed beta packages, reinstall a tarball that includes ui/dist."
  };
};

export const normalizeDoctorPort = (value?: number): number => {
  const port = value ?? defaultDoctorApiPort;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--check-api-port must be an integer between 1 and 65535.");
  }

  return port;
};

export const summarizeDoctorChecks = (checks: DoctorCheck[]): DoctorSummary =>
  checks.reduce<DoctorSummary>(
    (summary, check) => ({
      ...summary,
      [check.status]: summary[check.status] + 1
    }),
    {
      pass: 0,
      warn: 0,
      fail: 0,
      info: 0
    }
  );

export const buildDoctorChecks = async (
  options: DoctorOptions
): Promise<DoctorCheck[]> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const checks: DoctorCheck[] = [];
  const cwdCheck = await checkCwdExists(cwd);
  checks.push(cwdCheck);
  checks.push(await checkNodeVersion());
  checks.push(await checkGitAvailable());

  if (cwdCheck.status === "fail") {
    const policyCheck = await checkPolicyLoad(cwd, options.policy);
    checks.push(
      {
        id: "git-repo",
        label: "Git repository",
        status: "warn",
        message: "Git repository check skipped because cwd is unavailable."
      },
      policyCheck.check,
      {
        id: "runtime-dirs",
        label: ".stepharbor runtime directory",
        status: "info",
        message: "Runtime directory check skipped because cwd is unavailable."
      },
      {
        id: "audit-store",
        label: "Audit store",
        status: "info",
        message: "Audit store check skipped because cwd is unavailable."
      }
    );
  } else {
    checks.push(await checkGitRepo(cwd));
    const policyCheck = await checkPolicyLoad(cwd, options.policy);
    checks.push(policyCheck.check);
    checks.push(await checkRuntimeDirs(cwd));
    checks.push(await checkAuditStore(cwd));
  }

  const uiBuild = await checkUiBuild(undefined, options.uiDistDir);
  checks.push(uiBuild);

  if (options.skipPortCheck === true) {
    checks.push(skippedApiPortCheck());
  } else {
    checks.push(
      await checkApiPortAvailable(normalizeDoctorPort(options.checkApiPort))
    );
  }

  checks.push(await checkStepHarborRuntime());
  const policy = checks.find((check) => check.id === "policy-load") ?? {
    id: "policy-load",
    label: "Policy load",
    status: "fail",
    message: "Policy check did not run."
  };
  checks.push(checkStepHarborUiReady(uiBuild, policy, cwdCheck));

  return checks;
};
