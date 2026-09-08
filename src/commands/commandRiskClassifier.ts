import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import {
  cloudMutationVerbs,
  databaseMutationPattern,
  pipeToShellPattern,
  urlPattern,
  validationCommands
} from "./commandPatterns.js";
import type {
  CommandCategory,
  CommandRiskClassification,
  CommandRiskLevel
} from "./commandRiskTypes.js";

type CommandAction = Extract<
  NormalizedStepHarborAction,
  { type: "run_command" | "git_command" | "validation_command" }
>;

const commandActionTypes = new Set<NormalizedStepHarborAction["type"]>([
  "run_command",
  "git_command",
  "validation_command"
]);

export const isCommandLikeAction = (
  action: NormalizedStepHarborAction
): action is CommandAction => commandActionTypes.has(action.type);

const includesOption = (tokens: string[], option: string): boolean =>
  tokens.includes(option);

const optionContains = (token: string, flags: string[]): boolean =>
  token.startsWith("-") && flags.every((flag) => token.includes(flag));

const hasRecursiveForce = (tokens: string[]): boolean =>
  tokens.some((token) => optionContains(token, ["r", "f"]));

const firstUrl = (command: string): string | undefined =>
  urlPattern.exec(command)?.[0];

const toClassification = (
  risk: CommandRiskLevel,
  category: CommandCategory,
  reason: string,
  extra: Omit<
    CommandRiskClassification,
    "commandRiskScore" | "commandCategory" | "commandRiskReason"
  > = {}
): CommandRiskClassification => ({
  commandRiskScore: risk,
  commandCategory: category,
  commandRiskReason: reason,
  ...extra
});

const destructiveCommand = (
  reason: string,
  extra: Partial<CommandRiskClassification> = {}
): CommandRiskClassification =>
  toClassification("critical", "filesystem_destructive", reason, {
    destructiveOperation: true,
    destructiveSubtype: "destructive_command",
    destructiveSeverity: "critical",
    mutatesFilesystem: true,
    ...extra
  });

const classifyGit = (
  tokens: string[],
  lowerCommand: string
): CommandRiskClassification | undefined => {
  const subcommand = tokens[1];

  if (
    subcommand === "status" ||
    subcommand === "diff" ||
    subcommand === "log"
  ) {
    return toClassification("low", "git_read", "Git read-only command.");
  }

  if (
    subcommand === "clean" &&
    tokens.some((token) => optionContains(token, ["f", "d"]))
  ) {
    return destructiveCommand(
      "git clean with force/delete flags is destructive.",
      {
        mutatesGit: true
      }
    );
  }

  if (subcommand === "reset" && includesOption(tokens, "--hard")) {
    return destructiveCommand("git reset --hard is destructive.", {
      mutatesGit: true
    });
  }

  if (subcommand === "checkout" && lowerCommand.includes("git checkout -- .")) {
    return destructiveCommand(
      "git checkout -- . discards local file changes.",
      {
        mutatesGit: true
      }
    );
  }

  if (
    subcommand === "push" &&
    (includesOption(tokens, "--force") || includesOption(tokens, "-f"))
  ) {
    return toClassification(
      "critical",
      "git_history_rewrite",
      "Force push rewrites remote history.",
      {
        forcePush: true,
        mutatesGit: true,
        destructiveOperation: true,
        destructiveSubtype: "destructive_command",
        destructiveSeverity: "critical"
      }
    );
  }

  if (
    (subcommand === "commit" || subcommand === "push") &&
    includesOption(tokens, "--no-verify")
  ) {
    return toClassification(
      "high",
      "hook_bypass",
      "Git hook bypass skips configured checks.",
      {
        hookBypass: true,
        mutatesGit: true
      }
    );
  }

  if (subcommand === "rebase") {
    return toClassification(
      "high",
      "git_history_rewrite",
      "git rebase rewrites local history.",
      {
        mutatesGit: true
      }
    );
  }

  if (
    subcommand === "reset" &&
    (includesOption(tokens, "--mixed") || includesOption(tokens, "--soft"))
  ) {
    return toClassification(
      "high",
      "git_history_rewrite",
      "git reset changes commit state.",
      {
        mutatesGit: true
      }
    );
  }

  if (subcommand === "branch" && includesOption(tokens, "-D")) {
    return toClassification(
      "high",
      "git_mutation",
      "git branch -D deletes a branch.",
      {
        mutatesGit: true
      }
    );
  }

  if (subcommand === "commit" || subcommand === "merge") {
    return toClassification(
      "medium",
      "git_mutation",
      "Git command mutates repository state.",
      {
        mutatesGit: true
      }
    );
  }

  return undefined;
};

const classifyCloud = (
  executable: string,
  tokens: string[]
): CommandRiskClassification | undefined => {
  if (executable === "kubectl" && tokens[1] === "delete") {
    return toClassification(
      "high",
      "cloud_mutation",
      "kubectl delete mutates cluster resources.",
      {
        mutatesCloud: true
      }
    );
  }

  if (
    executable === "terraform" &&
    (tokens[1] === "apply" || tokens[1] === "destroy")
  ) {
    return toClassification(
      "high",
      "cloud_mutation",
      `terraform ${tokens[1]} mutates infrastructure.`,
      {
        mutatesCloud: true
      }
    );
  }

  if (
    (executable === "aws" || executable === "gcloud" || executable === "az") &&
    tokens.some((token) => cloudMutationVerbs.has(token))
  ) {
    return toClassification(
      "high",
      "cloud_mutation",
      `${executable} command contains a cloud mutation verb.`,
      {
        mutatesCloud: true
      }
    );
  }

  return undefined;
};

const classifyPackageManager = (
  executable: string,
  tokens: string[],
  lowerCommand: string
): CommandRiskClassification | undefined => {
  if (validationCommands.has(lowerCommand)) {
    return toClassification(
      "low",
      "validation",
      "Recognized validation command."
    );
  }

  if (
    (executable === "npm" && tokens[1] === "install") ||
    (executable === "pnpm" && tokens[1] === "add") ||
    (executable === "yarn" && tokens[1] === "add") ||
    (executable === "pip" && tokens[1] === "install") ||
    (executable === "poetry" && tokens[1] === "add")
  ) {
    return toClassification(
      "medium",
      "local_write",
      "Package manager command may mutate local dependency state.",
      {
        mutatesFilesystem: true,
        networkExposure: true
      }
    );
  }

  return undefined;
};

export const classifyCommandRisk = (
  action: NormalizedStepHarborAction
): CommandRiskClassification | undefined => {
  if (!isCommandLikeAction(action)) {
    return undefined;
  }

  const command = action.normalized.command ?? action.command.trim();
  const tokens = (action.normalized.commandTokens ?? []).map((token) =>
    token.toLowerCase()
  );
  const executable = (
    action.normalized.commandExecutable ??
    tokens[0] ??
    ""
  ).toLowerCase();
  const lowerCommand = command.toLowerCase().trim();
  const url = firstUrl(command);

  if (lowerCommand.length === 0 || executable.length === 0) {
    return toClassification(
      "unknown",
      "unknown",
      "Command is empty or could not be parsed."
    );
  }

  if (pipeToShellPattern.test(command)) {
    return toClassification(
      "critical",
      "remote_code_execution",
      "Remote code is piped directly to a shell.",
      {
        pipeToShell: true,
        downloadsRemoteCode: true,
        networkExposure: true,
        ...(url !== undefined ? { externalUrlSource: url } : {}),
        destructiveOperation: true,
        destructiveSubtype: "destructive_command",
        destructiveSeverity: "critical"
      }
    );
  }

  if (executable === "eval") {
    return toClassification(
      "critical",
      "remote_code_execution",
      "eval executes dynamically constructed shell input.",
      {
        usesEval: true,
        destructiveOperation: true,
        destructiveSubtype: "destructive_command",
        destructiveSeverity: "critical"
      }
    );
  }

  if (executable === "rm" && hasRecursiveForce(tokens)) {
    return destructiveCommand("rm with recursive force flags is destructive.");
  }

  if (executable === "git") {
    const gitClassification = classifyGit(tokens, lowerCommand);

    if (gitClassification !== undefined) {
      return gitClassification;
    }
  }

  if (executable === "sudo") {
    return toClassification(
      "high",
      "elevated_privilege",
      "sudo runs a command with elevated privileges.",
      {
        usesSudo: true
      }
    );
  }

  if (
    executable === "chmod" &&
    tokens.includes("-r") &&
    (tokens.includes("777") || tokens.length > 2)
  ) {
    return toClassification(
      "high",
      "local_write",
      "Recursive chmod can broadly alter permissions.",
      {
        mutatesFilesystem: true
      }
    );
  }

  if (executable === "chown" && tokens.includes("-r")) {
    return toClassification(
      "high",
      "local_write",
      "Recursive chown can broadly alter ownership.",
      {
        mutatesFilesystem: true
      }
    );
  }

  if (
    executable === "docker" &&
    tokens[1] === "system" &&
    tokens[2] === "prune"
  ) {
    return toClassification(
      "high",
      "filesystem_destructive",
      "docker system prune removes local Docker resources.",
      {
        mutatesFilesystem: true,
        destructiveOperation: true,
        destructiveSubtype: "destructive_command",
        destructiveSeverity: "high"
      }
    );
  }

  const cloudClassification = classifyCloud(executable, tokens);

  if (cloudClassification !== undefined) {
    return cloudClassification;
  }

  if (
    (executable === "psql" ||
      executable === "dropdb" ||
      executable === "mysql") &&
    (executable === "dropdb" || databaseMutationPattern.test(lowerCommand))
  ) {
    return toClassification(
      "high",
      "database_mutation",
      "Database command contains destructive mutation hints.",
      {
        mutatesDatabase: true
      }
    );
  }

  const packageClassification = classifyPackageManager(
    executable,
    tokens,
    lowerCommand
  );

  if (packageClassification !== undefined) {
    return packageClassification;
  }

  if (
    executable === "mv" ||
    executable === "cp" ||
    executable === "mkdir" ||
    executable === "touch"
  ) {
    return toClassification(
      "medium",
      "local_write",
      "Command mutates local filesystem state.",
      {
        mutatesFilesystem: true
      }
    );
  }

  if (executable === "ls" || executable === "pwd" || executable === "cat") {
    return toClassification(
      "low",
      "read_only",
      "Recognized read-only command."
    );
  }

  if (url !== undefined) {
    return toClassification(
      "medium",
      "network_exposure",
      "Command references an external URL.",
      {
        networkExposure: true,
        externalUrlSource: url
      }
    );
  }

  return toClassification(
    "unknown",
    "unknown",
    "Command is not recognized by the v1 classifier."
  );
};
