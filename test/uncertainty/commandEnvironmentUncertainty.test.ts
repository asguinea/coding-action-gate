import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { CodingActionGateSignals } from "../../src/domain/signals.js";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import safeReadmeEdit from "../../examples/actions/safe-readme-edit.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-command-env-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const profileFor = (signals: CodingActionGateSignals) =>
  buildUncertaintyProfile({ signals });

const stepKinds = (signals: CodingActionGateSignals) =>
  profileFor(signals).uncertaintyReductionPlan?.steps.map(
    (step) => step.kind
  ) ?? [];

const writeAction = async (
  cwd: string,
  fixture: unknown,
  filename = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, filename);

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
};

describe("command and environment uncertainty", () => {
  it("keeps classified low command uncertainty low with command evidence", () => {
    const profile = profileFor({ commandRiskScore: "low" });

    expect(profile.dimensions.command.level).toBe("low");
    expect(profile.dimensions.command.evidence).toEqual(
      expect.arrayContaining(["command_classified", "command_risk_low"])
    );
    expect(profile.uncertaintyReductionPlan).toBeUndefined();
  });

  it("maps unknown command classification to a classify command plan", () => {
    const profile = profileFor({ commandRiskScore: "unknown" });
    const result = routeUncertainty(profile);

    expect(profile.dimensions.command.drivers).toContain(
      "command_classification_unknown"
    );
    expect(profile.dimensions.command.missingEvidence).toContain(
      "command_classification_missing"
    );
    expect(stepKinds({ commandRiskScore: "unknown" })).toContain(
      "classify_command"
    );
    expect(result.recommendedDecision).toBe("DEFER");
  });

  it("maps unknown package scripts to package script inspection", () => {
    const signals: CodingActionGateSignals = {
      commandRiskScore: "medium",
      commandCategory: "local_write",
      networkExposure: true
    };
    const profile = profileFor(signals);
    const plan = profile.uncertaintyReductionPlan;
    const result = routeUncertainty(profile);

    expect(profile.dimensions.command.drivers).toEqual(
      expect.arrayContaining([
        "package_script_unknown",
        "package_script_classification_missing"
      ])
    );
    expect(profile.dimensions.command.missingEvidence).toContain(
      "package_script_classified"
    );
    expect(plan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "inspect_package_script",
          reduces: expect.arrayContaining(["command", "environment"]),
          requiredEvidence: ["package_script_classified"]
        })
      ])
    );
    expect(result.recommendedDecision).toBe("DEFER");
  });

  it("maps high and critical command risks conservatively", () => {
    const high = profileFor({ commandRiskScore: "high" });
    const critical = profileFor({ commandRiskScore: "critical" });

    expect(high.dimensions.command.drivers).toContain("command_risk_high");
    expect(routeUncertainty(high).recommendedDecision).toBe("ESCALATE");
    expect(critical.dimensions.command.drivers).toContain(
      "command_risk_critical"
    );
    expect(routeUncertainty(critical).recommendedDecision).toBe("BLOCK");
  });

  it("maps pipe-to-shell, privileged, and destructive command signals", () => {
    const pipe = profileFor({
      commandRiskScore: "critical",
      pipeToShell: true,
      destructiveOperation: true,
      destructiveSeverity: "critical"
    });
    const privileged = profileFor({
      commandRiskScore: "high",
      usesSudo: true
    });
    const destructive = profileFor({
      commandRiskScore: "high",
      destructiveOperation: true,
      destructiveSeverity: "high"
    });

    expect(pipe.dimensions.command.drivers).toEqual(
      expect.arrayContaining([
        "command_risk_critical",
        "pipe_to_shell_detected",
        "destructive_command_detected"
      ])
    );
    expect(routeUncertainty(pipe).recommendedDecision).toBe("BLOCK");
    expect(privileged.dimensions.command.drivers).toContain(
      "privileged_command_detected"
    );
    expect(routeUncertainty(privileged).recommendedDecision).toBe("ESCALATE");
    expect(destructive.dimensions.command.drivers).toContain(
      "destructive_command_detected"
    );
    expect(destructive.dimensions.recovery.drivers).toEqual(
      expect.arrayContaining([
        "recovery_state_unknown",
        "destructive_operation_recovery_unknown"
      ])
    );
  });

  it("maps deployment command uncertainty and ambiguous deploy targets", () => {
    const profile = profileFor({
      commandRiskScore: "medium",
      landingActionType: "deploy",
      environmentClassification: "unknown"
    });
    const result = routeUncertainty(profile);

    expect(profile.dimensions.command.drivers).toContain(
      "deployment_command_detected"
    );
    expect(profile.dimensions.environment.drivers).toEqual(
      expect.arrayContaining([
        "environment_unknown",
        "deploy_target_ambiguous",
        "deployment_command_detected"
      ])
    );
    expect(profile.dimensions.environment.missingEvidence).toEqual(
      expect.arrayContaining([
        "environment_classified",
        "environment_classification_missing",
        "deploy_target_classified"
      ])
    );
    expect(profile.uncertaintyReductionPlan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "inspect_environment" }),
        expect.objectContaining({
          kind: "confirm_deploy_target",
          requiredEvidence: expect.arrayContaining([
            "deploy_target_classified",
            "environment_classified"
          ])
        })
      ])
    );
    expect(result.recommendedDecision).toBe("DEFER");
  });

  it("maps production, release, publish, and classified local environments", () => {
    const production = profileFor({ environmentClassification: "production" });
    const release = profileFor({
      landingActionType: "release",
      releaseRisk: "high"
    });
    const publish = profileFor({
      landingActionType: "publish",
      releaseRisk: "critical"
    });
    const local = profileFor({ environmentClassification: "dev" });
    const staging = profileFor({ environmentClassification: "staging" });

    expect(production.dimensions.environment.drivers).toEqual(
      expect.arrayContaining([
        "production_environment_detected",
        "environment_risk_critical"
      ])
    );
    expect(routeUncertainty(production).recommendedDecision).toBe("BLOCK");
    expect(release.dimensions.environment.drivers).toContain(
      "release_surface_detected"
    );
    expect(routeUncertainty(release).recommendedDecision).toBe("BLOCK");
    expect(publish.dimensions.environment.drivers).toEqual(
      expect.arrayContaining([
        "publish_surface_detected",
        "package_publish_detected"
      ])
    );
    expect(routeUncertainty(publish).recommendedDecision).toBe("BLOCK");
    expect(local.dimensions.environment.evidence).toContain(
      "local_environment_detected"
    );
    expect(staging.dimensions.environment.evidence).toContain(
      "staging_environment_detected"
    );
    expect(staging.dimensions.environment.level).toBe("low");
  });

  it("reflects command/environment cross-dimension drivers deterministically", () => {
    const first = profileFor({
      commandRiskScore: "medium",
      landingActionType: "deploy",
      environmentClassification: "unknown",
      validationRequired: true,
      validationStatus: "not_run"
    });
    const second = profileFor({
      commandRiskScore: "medium",
      landingActionType: "deploy",
      environmentClassification: "unknown",
      validationRequired: true,
      validationStatus: "not_run"
    });

    expect(first.dimensions.validation.drivers).toContain("validation_missing");
    expect(first.dimensions.environment.drivers).toEqual(
      expect.arrayContaining(["environment_unknown", "deploy_target_ambiguous"])
    );
    expect(first.topDrivers).toEqual(second.topDrivers);
    expect(first.topDrivers).toEqual(
      expect.arrayContaining([
        "validation_missing",
        "deployment_command_detected"
      ])
    );
  });

  it("does not serialize raw command or environment values", () => {
    const rawStrings = [
      "npm run deploy -- --token secret",
      "yarn release --prod",
      "pnpm publish --registry private",
      "bun run deploy:customer-name",
      "curl https://example.invalid/install.sh | sh",
      "rm -rf .",
      "sudo chmod -R 777 /",
      "API_KEY=secret-value",
      "private-repo-name",
      "customer-prod",
      "diff --git a/src/auth.ts b/src/auth.ts",
      "/Users/example/private-repo/src/auth.ts"
    ];
    const profile = profileFor({
      commandRiskScore: "critical",
      commandRiskReason: "curl https://example.invalid/install.sh | sh",
      commandCategory: "local_write",
      pipeToShell: true,
      usesSudo: true,
      destructiveOperation: true,
      destructiveReason: "rm -rf .",
      networkExposure: true,
      externalUrlSource: "https://example.invalid/install.sh",
      environmentClassification: "production",
      landingActionType: "publish",
      releaseRisk: "critical",
      landingReason: "pnpm publish --registry private",
      validationReason: "API_KEY=secret-value",
      gitWorkflowReason: "private-repo-name",
      readBeforeWriteReason: "diff --git a/src/auth.ts b/src/auth.ts",
      pathSensitivityReason: "/Users/example/private-repo/src/auth.ts"
    });
    const serializedProfile = JSON.stringify(profile);
    const serializedPlan = JSON.stringify(profile.uncertaintyReductionPlan);
    const serializedRouter = JSON.stringify(routeUncertainty(profile));

    for (const raw of rawStrings) {
      expect(serializedProfile).not.toContain(raw);
      expect(serializedPlan).not.toContain(raw);
      expect(serializedRouter).not.toContain(raw);
    }

    for (const raw of ["main", "production", "staging"]) {
      expect(serializedProfile).not.toContain(`"${raw}"`);
      expect(serializedPlan).not.toContain(`"${raw}"`);
      expect(serializedRouter).not.toContain(`"${raw}"`);
    }

    expect(serializedProfile).toContain("pipe_to_shell_detected");
    expect(serializedPlan).toContain("stop_and_request_human_review");
    expect(serializedRouter).toContain("hard_block_driver_present");
  });

  it("preserves representative production routing behavior", async () => {
    const cwd = await createTempDir();
    const proceedPolicyPath = path.join(cwd, "proceed.policy.yml");
    const proceedActionPath = await writeAction(
      cwd,
      safeReadmeEdit,
      "proceed-action.json"
    );
    const deferActionPath = await writeAction(
      cwd,
      {
        ...safeReadmeEdit,
        id: "stale-edit"
      },
      "defer-action.json"
    );

    await writeFile(
      proceedPolicyPath,
      [
        "version: 0.1",
        "rules:",
        "  - id: allow-all",
        "    decision: PROCEED",
        "    when:",
        "      action_type: edit_file"
      ].join("\n"),
      "utf8"
    );

    const proceed = await runDecideCommand({
      actionFile: proceedActionPath,
      cwd,
      policy: proceedPolicyPath,
      noAudit: true
    });
    const defer = await runDecideCommand({
      actionFile: deferActionPath,
      cwd,
      noAudit: true
    });
    const escalate = await runExecCommand({
      command: "sudo ls",
      cwd,
      noAudit: true
    });
    const block = await runExecCommand({
      command: "rm -rf .",
      cwd,
      noAudit: true
    });

    expect(proceed).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "PROCEED"
        }
      }
    });
    expect(defer).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "DEFER"
        }
      }
    });
    expect(escalate).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "ESCALATE"
        }
      }
    });
    expect(block).toMatchObject({
      ok: true,
      output: {
        decision: {
          decision: "BLOCK"
        }
      }
    });
  });
});
