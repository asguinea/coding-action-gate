import type { CodingActionGatePolicy } from "../domain/policies.js";

export const defaultProtectedBranches = [
  "main",
  "master",
  "production",
  "release/*"
] as const;

const wildcardPatternToRegex = (pattern: string): RegExp => {
  const source = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${source}$`);
};

export const protectedBranchPatterns = (
  policy?: Pick<CodingActionGatePolicy, "protectedBranches">
): string[] =>
  policy?.protectedBranches !== undefined && policy.protectedBranches.length > 0
    ? policy.protectedBranches
    : [...defaultProtectedBranches];

export const isProtectedBranch = (
  branch: string | undefined,
  policy?: Pick<CodingActionGatePolicy, "protectedBranches">
): boolean => {
  if (branch === undefined || branch.length === 0) {
    return false;
  }

  return protectedBranchPatterns(policy).some((pattern) => {
    if (!pattern.includes("*")) {
      return branch === pattern;
    }

    return wildcardPatternToRegex(pattern).test(branch);
  });
};
