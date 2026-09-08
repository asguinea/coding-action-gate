import { access } from "node:fs/promises";
import path from "node:path";

export const policyFileNames = [
  "coding-action-gate.policy.yml",
  "coding-action-gate.policy.yaml",
  ".coding-action-gate.policy.yml",
  ".coding-action-gate.policy.yaml"
] as const;

export type PolicyFileName = (typeof policyFileNames)[number];

export const findPolicyFile = async (cwd: string): Promise<string | null> => {
  for (const fileName of policyFileNames) {
    const candidate = path.resolve(cwd, fileName);

    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
};
