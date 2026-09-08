import { z } from "zod";
import { isoTimestampSchema } from "./common.js";

export const actionTypeSchema = z.enum([
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "run_command",
  "git_command",
  "validation_command"
]);

export type ActionType = z.infer<typeof actionTypeSchema>;

export const proposedBySchema = z.enum(["agent", "user", "system", "unknown"]);

export type ProposedBy = z.infer<typeof proposedBySchema>;

export const actionOriginSchema = z.object({
  agentId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  toolId: z.string().min(1).optional(),
  subagentId: z.string().min(1).optional()
});

export type ActionOrigin = z.infer<typeof actionOriginSchema>;

const baseActionSchema = z.object({
  id: z.string().min(1),
  timestamp: isoTimestampSchema,
  proposedBy: proposedBySchema,
  origin: actionOriginSchema.optional(),
  raw: z.unknown().optional()
});

export const readFileActionSchema = baseActionSchema.extend({
  type: z.literal("read_file"),
  targetPath: z.string().min(1),
  expectedHash: z.string().min(1).optional()
});

export type ReadFileAction = z.infer<typeof readFileActionSchema>;

export const writeFileActionSchema = baseActionSchema.extend({
  type: z.literal("write_file"),
  targetPath: z.string().min(1),
  content: z.string().optional(),
  contentHash: z.string().min(1).optional(),
  expectedHash: z.string().min(1).optional()
});

export type WriteFileAction = z.infer<typeof writeFileActionSchema>;

export const editFileActionSchema = baseActionSchema.extend({
  type: z.literal("edit_file"),
  targetPath: z.string().min(1),
  diff: z.string().optional(),
  diffStats: z
    .object({
      files: z.number().int().nonnegative().optional(),
      addedLines: z.number().int().nonnegative().optional(),
      deletedLines: z.number().int().nonnegative().optional()
    })
    .optional(),
  expectedHash: z.string().min(1).optional()
});

export type EditFileAction = z.infer<typeof editFileActionSchema>;

export const deleteFileActionSchema = baseActionSchema.extend({
  type: z.literal("delete_file"),
  targetPath: z.string().min(1),
  expectedHash: z.string().min(1).optional()
});

export type DeleteFileAction = z.infer<typeof deleteFileActionSchema>;

export const runCommandActionSchema = baseActionSchema.extend({
  type: z.literal("run_command"),
  command: z.string().min(1),
  cwd: z.string().min(1).optional()
});

export type RunCommandAction = z.infer<typeof runCommandActionSchema>;

export const gitCommandActionSchema = baseActionSchema.extend({
  type: z.literal("git_command"),
  command: z.string().min(1),
  cwd: z.string().min(1).optional()
});

export type GitCommandAction = z.infer<typeof gitCommandActionSchema>;

export const validationKindSchema = z.enum([
  "test",
  "lint",
  "typecheck",
  "build",
  "security",
  "other"
]);

export type ValidationKind = z.infer<typeof validationKindSchema>;

export const validationCommandActionSchema = baseActionSchema.extend({
  type: z.literal("validation_command"),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  validationKind: validationKindSchema.optional()
});

export type ValidationCommandAction = z.infer<
  typeof validationCommandActionSchema
>;

export const codingActionGateActionSchema = z.discriminatedUnion("type", [
  readFileActionSchema,
  writeFileActionSchema,
  editFileActionSchema,
  deleteFileActionSchema,
  runCommandActionSchema,
  gitCommandActionSchema,
  validationCommandActionSchema
]);

export type CodingActionGateAction = z.infer<
  typeof codingActionGateActionSchema
>;
