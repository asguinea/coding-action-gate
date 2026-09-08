import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import type { StepHarborSignals } from "../../src/domain/signals.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { secretDetector } from "../../src/signals/detectors/secretDetector.js";

const tempDirs: string[] = [];
const fakeLongSecret = "abcdefghijklmnopqrstuvwxyz1234567890";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-secret-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const readAction = (targetPath: string): StepHarborAction => ({
  id: `read-${targetPath.replace(/\W+/g, "-")}`,
  type: "read_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath
});

const editAction = (
  targetPath: string,
  diff = "@@ -1,1 +1,1 @@\n-old\n+new\n"
): StepHarborAction => ({
  id: `edit-${targetPath.replace(/\W+/g, "-")}`,
  type: "edit_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath,
  diff,
  diffStats: {
    files: 1,
    addedLines: 1,
    deletedLines: 1
  }
});

const writeAction = (
  targetPath: string,
  content: string
): StepHarborAction => ({
  id: `write-${targetPath.replace(/\W+/g, "-")}`,
  type: "write_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath,
  content
});

const commandAction = (command: string): StepHarborAction => ({
  id: `command-${command.replace(/\W+/g, "-")}`,
  type: "run_command",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  command
});

const normalize = (action: StepHarborAction, cwd = process.cwd()) => {
  const normalized = normalizeAction(action, { cwd });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  return normalized.action;
};

const computeSecretSignals = (action: StepHarborAction): StepHarborSignals =>
  secretDetector.compute({
    action: normalize(action),
    policy: defaultPolicy
  }) as StepHarborSignals;

const writeActionFile = async (
  cwd: string,
  action: StepHarborAction
): Promise<string> => {
  const actionPath = path.join(cwd, "action.json");

  await writeFile(actionPath, JSON.stringify(action), "utf8");

  return actionPath;
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

describe("secretDetector", () => {
  it("classifies read_file .env as confirmed", () => {
    expect(computeSecretSignals(readAction(".env"))).toMatchObject({
      secretTouch: "confirmed",
      secretPathMatch: true,
      credentialFileType: "env_file"
    });
  });

  it("classifies read_file .env.local as confirmed", () => {
    expect(computeSecretSignals(readAction(".env.local"))).toMatchObject({
      secretTouch: "confirmed",
      secretPathMatch: true
    });
  });

  it("classifies read_file .ssh/id_rsa as confirmed", () => {
    expect(computeSecretSignals(readAction(".ssh/id_rsa"))).toMatchObject({
      secretTouch: "confirmed",
      credentialFileType: "ssh_credentials"
    });
  });

  it("classifies read_file certs/private.pem as confirmed", () => {
    expect(computeSecretSignals(readAction("certs/private.pem"))).toMatchObject(
      {
        secretTouch: "confirmed",
        credentialFileType: "private_key"
      }
    );
  });

  it("classifies read_file credentials.json as confirmed", () => {
    expect(computeSecretSignals(readAction("credentials.json"))).toMatchObject({
      secretTouch: "confirmed",
      credentialFileType: "credentials_json"
    });
  });

  it("classifies README.md as none", () => {
    expect(computeSecretSignals(readAction("README.md"))).toMatchObject({
      secretTouch: "none",
      secretPathMatch: false,
      secretPatternMatch: false
    });
  });

  it("classifies cat .env as probable command secret access", () => {
    expect(computeSecretSignals(commandAction("cat .env"))).toMatchObject({
      secretTouch: "probable",
      commandContainsSecret: true,
      outputRedactionRequired: true
    });
  });

  it("classifies printenv as possible command secret exposure", () => {
    expect(computeSecretSignals(commandAction("printenv"))).toMatchObject({
      secretTouch: "possible",
      commandContainsSecret: true,
      outputRedactionRequired: true
    });
  });

  it("classifies echo of secret-like env vars as probable", () => {
    expect(
      computeSecretSignals(commandAction("echo $OPENAI_API_KEY"))
    ).toMatchObject({
      secretTouch: "probable",
      commandContainsSecret: true,
      outputRedactionRequired: true
    });
  });

  it("detects AWS keys in diffs", () => {
    expect(
      computeSecretSignals(
        editAction("README.md", "+key=AKIA1234567890ABCDEF\n")
      )
    ).toMatchObject({
      secretTouch: "confirmed",
      secretPatternMatch: true,
      diffContainsSecret: true,
      matchedSecretPatterns: expect.arrayContaining(["aws_access_key_id"])
    });
  });

  it("detects private key blocks in diffs", () => {
    expect(
      computeSecretSignals(
        editAction("README.md", "+-----BEGIN PRIVATE KEY-----\n")
      )
    ).toMatchObject({
      secretTouch: "confirmed",
      diffContainsSecret: true,
      matchedSecretPatterns: expect.arrayContaining(["private_key_block"])
    });
  });

  it("detects GitHub tokens in content", () => {
    expect(
      computeSecretSignals(
        writeAction("README.md", "ghp_abcdefghijklmnopqrstuvwxyz123456")
      )
    ).toMatchObject({
      secretTouch: "confirmed",
      secretPatternMatch: true,
      matchedSecretPatterns: expect.arrayContaining(["github_token"])
    });
  });

  it("detects Stripe keys in content", () => {
    expect(
      computeSecretSignals(
        writeAction("README.md", "sk_live_1234567890abcdefghij")
      )
    ).toMatchObject({
      secretTouch: "confirmed",
      matchedSecretPatterns: expect.arrayContaining(["stripe_secret_key"])
    });
  });

  it("detects generic api_key assignments as probable", () => {
    expect(
      computeSecretSignals(
        writeAction("README.md", `api_key=${fakeLongSecret}`)
      )
    ).toMatchObject({
      secretTouch: "probable",
      matchedSecretPatterns: expect.arrayContaining([
        "generic_secret_assignment"
      ])
    });
  });

  it("classifies unlabeled high entropy strings as possible", () => {
    expect(
      computeSecretSignals(
        writeAction("README.md", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6")
      )
    ).toMatchObject({
      secretTouch: "possible",
      entropyAnomaly: true
    });
  });

  it("classifies entropy near token labels as probable", () => {
    expect(
      computeSecretSignals(
        writeAction("README.md", "token=A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6")
      )
    ).toMatchObject({
      secretTouch: "probable",
      entropyAnomaly: true
    });
  });

  it("does not flag normal README text as entropy anomaly", () => {
    expect(
      computeSecretSignals(
        writeAction(
          "README.md",
          "StepHarbor is a runtime authorization layer for agentic coding."
        )
      )
    ).toMatchObject({
      secretTouch: "none",
      entropyAnomaly: false
    });
  });

  it("does not include raw secret values in matchedSecretPatterns", () => {
    const signals = computeSecretSignals(
      writeAction("README.md", `api_key=${fakeLongSecret}`)
    );

    expect(JSON.stringify(signals.matchedSecretPatterns)).not.toContain(
      fakeLongSecret
    );
  });

  it("default policy blocks read_file .env", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeActionFile(cwd, readAction(".env")),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.signalSummary).toMatchObject({
        secretTouch: "confirmed",
        secretPathMatch: true
      });
    }
  });

  it("default policy blocks run_command cat .env", async () => {
    const result = await runExecCommand({
      command: "cat .env",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.signalSummary).toMatchObject({
        secretTouch: "probable",
        commandContainsSecret: true
      });
    }
  });

  it("default policy blocks mutation containing probable secret material", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeActionFile(
        cwd,
        editAction("README.md", `+api_key=${fakeLongSecret}\n`)
      ),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.reason).toBe(
        "Proposed mutation appears to contain secret material."
      );
    }
  });

  it("default policy does not block normal README edit, but freshness can defer it", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeActionFile(cwd, editAction("README.md")),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.signalSummary).toMatchObject({
        secretTouch: "none",
        targetFileFreshness: "unknown"
      });
    }
  });

  it("audit record includes sanitized secret-detector result", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeActionFile(
        cwd,
        editAction("README.md", `+api_key=${fakeLongSecret}\n`)
      ),
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);
      const detectorEvidence = JSON.stringify(
        (records[0] as { evidence?: unknown }).evidence
      );

      expect(detectorEvidence).toContain("secret-detector");
      expect(detectorEvidence).toContain("generic_secret_assignment");
      expect(detectorEvidence).not.toContain(fakeLongSecret);
    }
  });

  it("provided signals override computed secretTouch", async () => {
    const result = await computeSafetySignals({
      action: normalize(readAction(".env")),
      policy: defaultPolicy,
      providedSignals: {
        secretTouch: "none"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.secretTouch).toBe("none");
      expect(result.computedSignals.secretTouch).toBe("confirmed");
    }
  });

  it("does not need target files to exist", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeActionFile(cwd, readAction(".env")),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);
  });
});
