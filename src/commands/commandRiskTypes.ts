import type { CodingActionGateSignals } from "../domain/signals.js";

export type CommandRiskLevel = NonNullable<
  CodingActionGateSignals["commandRiskScore"]
>;

export type CommandCategory =
  | "read_only"
  | "validation"
  | "local_write"
  | "filesystem_destructive"
  | "git_read"
  | "git_mutation"
  | "git_history_rewrite"
  | "hook_bypass"
  | "remote_code_execution"
  | "elevated_privilege"
  | "network_exposure"
  | "database_mutation"
  | "cloud_mutation"
  | "unknown";

export interface CommandRiskClassification {
  commandRiskScore: CommandRiskLevel;
  commandCategory: CommandCategory;
  commandRiskReason: string;
  pipeToShell?: boolean;
  downloadsRemoteCode?: boolean;
  usesSudo?: boolean;
  usesEval?: boolean;
  forcePush?: boolean;
  hookBypass?: boolean;
  mutatesFilesystem?: boolean;
  mutatesGit?: boolean;
  mutatesDatabase?: boolean;
  mutatesCloud?: boolean;
  networkExposure?: boolean;
  externalUrlSource?: string;
  destructiveOperation?: boolean;
  destructiveSubtype?: string;
  destructiveSeverity?: CommandRiskLevel;
}
