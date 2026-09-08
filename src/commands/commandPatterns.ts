export const urlPattern = /https?:\/\/[^\s|'"`]+/i;

export const pipeToShellPattern =
  /\b(?:curl|wget)\b[\s\S]*\|[\s\S]*\b(?:sh|bash)\b/i;

export const databaseMutationPattern =
  /\b(?:drop\s+(?:database|table)|dropdb|truncate\s+table|delete\s+from)\b/i;

export const cloudMutationVerbs = new Set([
  "delete",
  "remove",
  "terminate",
  "destroy"
]);

export const validationCommands = new Set([
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
  "pnpm test",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm build",
  "yarn test",
  "yarn lint",
  "yarn typecheck",
  "yarn build",
  "pytest",
  "go test",
  "cargo test"
]);
