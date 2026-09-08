import { detectEntropyAnomaly } from "./secretEntropy.js";
import type {
  SecretEntropyFinding,
  SecretPatternFinding
} from "./secretTypes.js";

interface SecretPatternDefinition {
  name: string;
  confidence: SecretPatternFinding["confidence"];
  pattern: RegExp;
}

const secretPatterns: SecretPatternDefinition[] = [
  {
    name: "private_key_block",
    confidence: "confirmed",
    pattern:
      /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----|-----BEGIN PRIVATE KEY-----/i
  },
  {
    name: "aws_access_key_id",
    confidence: "confirmed",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/
  },
  {
    name: "github_token",
    confidence: "confirmed",
    pattern: /\b(?:ghp_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/
  },
  {
    name: "slack_token",
    confidence: "probable",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/
  },
  {
    name: "authorization_bearer_token",
    confidence: "probable",
    pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{20,}/i
  },
  {
    name: "stripe_secret_key",
    confidence: "confirmed",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}\b/
  },
  {
    name: "openai_api_key",
    confidence: "confirmed",
    pattern: /\b(?:sk-[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,})\b/
  },
  {
    name: "generic_secret_assignment",
    confidence: "probable",
    pattern:
      /\b(?:api[_-]?key|apikey|secret|token|password|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{16,}/i
  }
];

export const detectSecretPatterns = (source: string): SecretPatternFinding[] =>
  secretPatterns
    .filter((definition) => definition.pattern.test(source))
    .map((definition) => ({
      patternName: definition.name,
      confidence: definition.confidence
    }));

export const detectSecretPatternsAndEntropy = (
  source: string
): {
  patternFindings: SecretPatternFinding[];
  entropyFinding?: SecretEntropyFinding;
} => {
  const entropyFinding = detectEntropyAnomaly(source);

  return {
    patternFindings: detectSecretPatterns(source),
    ...(entropyFinding !== undefined ? { entropyFinding } : {})
  };
};
