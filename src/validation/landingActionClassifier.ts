import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";

export type LandingActionScope =
  | "before_commit"
  | "before_push"
  | "none"
  | "unknown";

export const classifyLandingAction = (
  action: NormalizedStepHarborAction
): LandingActionScope => {
  const isGitLike =
    action.type === "git_command" ||
    (action.type === "run_command" &&
      action.normalized.isGitLikeCommand === true);

  if (!isGitLike) {
    return "none";
  }

  const tokens = action.normalized.commandTokens ?? [];
  const executable = tokens[0]?.toLowerCase();

  if (executable !== "git") {
    return "unknown";
  }

  const subcommand = tokens[1]?.toLowerCase();

  switch (subcommand) {
    case "commit":
    case "merge":
      return "before_commit";
    case "push":
      return "before_push";
    case undefined:
      return "unknown";
    default:
      return "none";
  }
};
