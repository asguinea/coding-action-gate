import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import type { LandingActionClassification } from "./landingActionTypes.js";

const commandActionTypes = new Set<NormalizedStepHarborAction["type"]>([
  "run_command",
  "git_command",
  "validation_command"
]);

const isCommandAction = (action: NormalizedStepHarborAction): boolean =>
  commandActionTypes.has(action.type);

const token = (tokens: string[], index: number): string | undefined =>
  tokens[index]?.toLowerCase();

const containsToken = (tokens: string[], value: string): boolean =>
  tokens.some((candidate) => candidate.toLowerCase() === value);

const includesAny = (command: string, values: string[]): boolean =>
  values.some((value) => command.includes(value));

export const classifyLandingAction = (
  action: NormalizedStepHarborAction
): LandingActionClassification => {
  if (!isCommandAction(action)) {
    return {
      landingAction: false,
      reason: "Action is not command-like."
    };
  }

  const tokens = action.normalized.commandTokens ?? [];
  const executable = token(tokens, 0);
  const subcommand = token(tokens, 1);
  const third = token(tokens, 2);
  const command = (action.normalized.command ?? "").toLowerCase();

  if (executable === "git") {
    switch (subcommand) {
      case "commit":
        return {
          landingAction: true,
          landingActionType: "commit",
          reason: "git commit creates local shared-history candidate work."
        };
      case "push":
        return {
          landingAction: true,
          landingActionType: "push",
          reason: "git push moves work to a remote branch."
        };
      case "merge":
        return {
          landingAction: true,
          landingActionType: "merge",
          reason: "git merge combines work into the current branch."
        };
      case "rebase":
        return {
          landingAction: true,
          landingActionType: "rebase",
          reason: "git rebase rewrites or reapplies commit history."
        };
      case undefined:
        return {
          landingAction: true,
          landingActionType: "unknown_landing",
          reason: "Git landing command could not be classified."
        };
      default:
        return {
          landingAction: false,
          reason: "Git command is not a landing action."
        };
    }
  }

  if (
    (executable === "vercel" && subcommand === "deploy") ||
    (executable === "netlify" && subcommand === "deploy") ||
    (executable === "firebase" && subcommand === "deploy") ||
    (executable === "railway" &&
      (subcommand === "up" || subcommand === "deploy")) ||
    (executable === "fly" && subcommand === "deploy") ||
    (executable === "kubectl" && subcommand === "apply") ||
    (executable === "helm" && subcommand === "upgrade") ||
    (executable === "terraform" &&
      (subcommand === "apply" || subcommand === "destroy")) ||
    (executable === "serverless" && subcommand === "deploy") ||
    (executable === "sls" && subcommand === "deploy") ||
    (executable === "aws" &&
      subcommand === "cloudformation" &&
      third === "deploy") ||
    (executable === "gcloud" && containsToken(tokens, "deploy")) ||
    (executable === "az" && subcommand === "deployment")
  ) {
    return {
      landingAction: true,
      landingActionType: "deploy",
      reason: "Command appears to deploy infrastructure or application code."
    };
  }

  if (
    (executable === "npm" && subcommand === "publish") ||
    (executable === "pnpm" && subcommand === "publish") ||
    (executable === "yarn" && subcommand === "npm" && third === "publish") ||
    (executable === "twine" && subcommand === "upload") ||
    (executable === "cargo" && subcommand === "publish") ||
    (executable === "docker" && subcommand === "push")
  ) {
    return {
      landingAction: true,
      landingActionType: "publish",
      reason: "Command appears to publish an artifact."
    };
  }

  if (
    (executable === "gh" && subcommand === "release" && third === "create") ||
    executable === "semantic-release" ||
    includesAny(command, [" semantic-release", "npx semantic-release"])
  ) {
    return {
      landingAction: true,
      landingActionType: "release",
      reason: "Command appears to create a release."
    };
  }

  return {
    landingAction: false,
    reason: "Command is not a landing action."
  };
};
