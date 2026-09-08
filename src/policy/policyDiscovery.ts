import { access } from "node:fs/promises";
import path from "node:path";

export const policyFileNames = [
  "stepharbor.policy.yml",
  "stepharbor.policy.yaml",
  ".stepharbor.policy.yml",
  ".stepharbor.policy.yaml"
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
