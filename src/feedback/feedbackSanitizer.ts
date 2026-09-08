import { createHash } from "node:crypto";
import path from "node:path";

import { redactObject } from "../redaction/redactObject.js";
import { redactString } from "../redaction/redactString.js";
import type { FeedbackPathSummary } from "./feedbackTypes.js";

const unsafePathPattern =
  /(^|[/\\])(?:\.env(?:\.|$)|id_rsa|id_ed25519|\.npmrc|\.pypirc|credentials?|secrets?)([/\\]|$)/i;
const absolutePosixPathPattern =
  /(^|[\s(["'])((?:\/[A-Za-z0-9._@+-]+){2,})(?=$|[\s)"',\]}])/g;
const absoluteWindowsPathPattern = /[A-Za-z]:\\(?:[^\\\s"',]+\\)+[^\\\s"',]*/g;

export const hashFeedbackValue = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const sanitizeBasename = (input: string): string => {
  const basename = path.basename(input);
  const redacted = redactString(basename).value;

  if (unsafePathPattern.test(input) || redacted !== basename) {
    return "[REDACTED]";
  }

  return redacted;
};

export const summarizePathForFeedback = (
  input: string
): FeedbackPathSummary => ({
  basename: sanitizeBasename(input),
  hash: hashFeedbackValue(path.resolve(input))
});

export const sanitizeCommandSummary = (command: string): string => {
  const redacted = redactString(command).value.trim();
  const tokens = redacted.split(/\s+/).filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "";
  }

  if (redacted.includes("[REDACTED]")) {
    return `${tokens[0]} [REDACTED]`;
  }

  if (tokens.length > 1) {
    return `${tokens[0]} [arguments omitted]`;
  }

  return tokens[0] ?? "";
};

export const sanitizeFeedbackText = (input: string): string => {
  const redacted = redactString(input).value;
  return redacted
    .replace(absoluteWindowsPathPattern, "[PATH]")
    .replace(
      absolutePosixPathPattern,
      (_match, prefix: string) => `${prefix}[PATH]`
    );
};

const sensitiveKeys = new Set([
  "rawAction",
  "normalizedAction",
  "originalAction",
  "raw",
  "diff",
  "content",
  "outputSummary",
  "stdout",
  "stderr",
  "logs",
  "log",
  "env"
]);

export const removeUnsafeFeedbackFields = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map(removeUnsafeFeedbackFields);
  }

  if (typeof input === "string") {
    return sanitizeFeedbackText(input);
  }

  if (input === null || typeof input !== "object") {
    return input;
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (sensitiveKeys.has(key)) {
      continue;
    }

    output[key] = removeUnsafeFeedbackFields(value);
  }

  return output;
};

export const finalizeFeedbackExport = <T>(input: T): T => {
  const stripped = removeUnsafeFeedbackFields(input);
  return redactObject(stripped).value as T;
};
