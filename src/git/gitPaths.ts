import path from "node:path";

export const resolveGitCwd = (cwd?: string): string =>
  path.resolve(cwd ?? process.cwd());
