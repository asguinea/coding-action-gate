import type { RedactionOptions, RedactionPattern } from "./redactionTypes.js";

export const defaultRedactionReplacement = "[REDACTED]";
export const defaultRedactionMaxDepth = 8;

export const defaultSensitiveObjectKeys = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "apiKey",
  "access_token",
  "refresh_token",
  "private_key",
  "client_secret",
  "authorization",
  "cookie",
  "set-cookie"
];

const preserveBearerLabel = (match: string, replacement: string): string =>
  match.replace(
    /(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/-]{20,})/i,
    `$1${replacement}`
  );

const preserveAssignmentKey = (match: string, replacement: string): string =>
  match.replace(
    /(\b(?:api[_-]?key|apikey|secret|token|password|private[_-]?key)\b\s*[:=]\s*["']?)([A-Za-z0-9_./+=:-]{8,})/i,
    `$1${replacement}`
  );

export const redactionPatterns: RedactionPattern[] = [
  {
    name: "private_key_block",
    pattern:
      /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH )?PRIVATE KEY-----/gi,
    replace: (_match, replacement) => replacement
  },
  {
    name: "aws_access_key_id",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replace: (_match, replacement) => replacement
  },
  {
    name: "github_token",
    pattern: /\b(?:ghp_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g,
    replace: (_match, replacement) => replacement
  },
  {
    name: "slack_token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replace: (_match, replacement) => replacement
  },
  {
    name: "stripe_secret_key",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}\b/g,
    replace: (_match, replacement) => replacement
  },
  {
    name: "openai_api_key",
    pattern: /\b(?:sk-[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,})\b/g,
    replace: (_match, replacement) => replacement
  },
  {
    name: "authorization_bearer_token",
    pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{20,}/gi,
    replace: preserveBearerLabel
  },
  {
    name: "generic_secret_assignment",
    pattern:
      /\b(?:api[_-]?key|apikey|secret|token|password|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{8,}/gi,
    replace: preserveAssignmentKey
  }
];

const normalizeKey = (key: string): string =>
  key.replace(/[-_]/g, "").toLowerCase();

export const sensitiveObjectKeySet = (
  options: RedactionOptions = {}
): Set<string> =>
  new Set(
    [...defaultSensitiveObjectKeys, ...(options.redactKeys ?? [])].map(
      normalizeKey
    )
  );

export const isSensitiveObjectKey = (
  key: string,
  options: RedactionOptions = {}
): boolean => sensitiveObjectKeySet(options).has(normalizeKey(key));
