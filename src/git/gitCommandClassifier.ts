import type { CodingActionGateSignals } from "../domain/signals.js";

export type GitCommandCategory =
  | "git_read"
  | "git_commit"
  | "git_push"
  | "git_merge"
  | "git_rebase"
  | "git_reset"
  | "git_checkout"
  | "git_branch_delete"
  | "git_clean"
  | "git_pull"
  | "git_unknown";

export interface GitCommandClassification {
  gitCommandCategory: GitCommandCategory;
  mutatesGit: boolean;
  forcePush?: boolean;
  hookBypass?: boolean;
  remoteTarget?: string;
  targetBranch?: string;
}

const readSubcommands = new Set(["status", "diff", "log", "show"]);

const optionHasFlag = (token: string, flag: string): boolean =>
  token.startsWith("-") && !token.startsWith("--") && token.includes(flag);

const hasOption = (tokens: string[], options: string[]): boolean =>
  tokens.some((token) => options.includes(token));

const hasForcePush = (tokens: string[]): boolean =>
  hasOption(tokens, ["--force", "--force-with-lease"]) ||
  tokens.some((token) => optionHasFlag(token, "f"));

const hasHookBypass = (tokens: string[]): boolean =>
  tokens.includes("--no-verify");

const refspecTargetBranch = (refspec: string): string => {
  const colonIndex = refspec.lastIndexOf(":");
  const branch = colonIndex >= 0 ? refspec.slice(colonIndex + 1) : refspec;

  return branch.replace(/^refs\/heads\//, "");
};

const pushPositionals = (tokens: string[]): string[] => {
  const positionals: string[] = [];

  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === undefined) {
      continue;
    }

    if (token === "--") {
      positionals.push(...tokens.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const hasInlineValue = token.includes("=");
      const next = tokens[index + 1];

      if (
        !hasInlineValue &&
        (token === "--repo" ||
          token === "--receive-pack" ||
          token === "--exec" ||
          token === "--push-option") &&
        next !== undefined
      ) {
        index += 1;
      }
      continue;
    }

    if (token.startsWith("-")) {
      continue;
    }

    positionals.push(token);
  }

  return positionals;
};

export const classifyGitCommand = (
  tokens: string[],
  gitState: {
    currentBranch?: string;
    upstreamRemote?: string;
  } = {}
): GitCommandClassification | undefined => {
  const normalizedTokens = tokens.map((token) => token.trim());
  const executable = normalizedTokens[0]?.toLowerCase();

  if (executable !== "git") {
    return undefined;
  }

  const subcommand = normalizedTokens[1]?.toLowerCase();
  const lowerTokens = normalizedTokens.map((token) => token.toLowerCase());

  if (subcommand === undefined) {
    return {
      gitCommandCategory: "git_unknown",
      mutatesGit: false
    };
  }

  if (readSubcommands.has(subcommand)) {
    return {
      gitCommandCategory: "git_read",
      mutatesGit: false
    };
  }

  if (subcommand === "commit") {
    return {
      gitCommandCategory: "git_commit",
      mutatesGit: true,
      ...(hasHookBypass(lowerTokens) ? { hookBypass: true } : {})
    };
  }

  if (subcommand === "push") {
    const positionals = pushPositionals(normalizedTokens);
    const remote = positionals[0] ?? gitState.upstreamRemote;
    const explicitRefspec = positionals[1];
    const targetBranch =
      explicitRefspec !== undefined
        ? refspecTargetBranch(explicitRefspec)
        : gitState.currentBranch;
    const remoteTarget =
      remote !== undefined && targetBranch !== undefined
        ? `${remote}/${targetBranch}`
        : undefined;

    return {
      gitCommandCategory: "git_push",
      mutatesGit: true,
      ...(hasForcePush(lowerTokens) ? { forcePush: true } : {}),
      ...(hasHookBypass(lowerTokens) ? { hookBypass: true } : {}),
      ...(remoteTarget !== undefined ? { remoteTarget } : {}),
      ...(targetBranch !== undefined ? { targetBranch } : {})
    };
  }

  if (subcommand === "merge") {
    return {
      gitCommandCategory: "git_merge",
      mutatesGit: true
    };
  }

  if (subcommand === "rebase") {
    return {
      gitCommandCategory: "git_rebase",
      mutatesGit: true
    };
  }

  if (subcommand === "reset") {
    return {
      gitCommandCategory: "git_reset",
      mutatesGit: true
    };
  }

  if (subcommand === "checkout" || subcommand === "switch") {
    return {
      gitCommandCategory: "git_checkout",
      mutatesGit: true
    };
  }

  if (
    subcommand === "branch" &&
    lowerTokens.some((token) => token === "-d" || token === "-D")
  ) {
    return {
      gitCommandCategory: "git_branch_delete",
      mutatesGit: true
    };
  }

  if (subcommand === "clean") {
    return {
      gitCommandCategory: "git_clean",
      mutatesGit: true
    };
  }

  if (subcommand === "pull") {
    return {
      gitCommandCategory: "git_pull",
      mutatesGit: true
    };
  }

  return {
    gitCommandCategory: "git_unknown",
    mutatesGit: false
  };
};

export const gitCommandSignals = (
  classification: GitCommandClassification | undefined
): CodingActionGateSignals => {
  if (classification === undefined) {
    return {};
  }

  return {
    gitCommandCategory: classification.gitCommandCategory,
    mutatesGit: classification.mutatesGit,
    ...(classification.forcePush !== undefined
      ? { forcePush: classification.forcePush }
      : {}),
    ...(classification.hookBypass !== undefined
      ? { hookBypass: classification.hookBypass }
      : {}),
    ...(classification.remoteTarget !== undefined
      ? { remoteTarget: classification.remoteTarget }
      : {})
  };
};
