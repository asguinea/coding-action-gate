import type { SecretEntropyFinding } from "./secretTypes.js";

const entropyCandidatePattern = /[A-Za-z0-9_+/-]{24,}={0,2}/g;
const secretLabelPattern =
  /\b(api[_-]?key|apikey|secret|token|password|private[_-]?key)\b/i;

export const shannonEntropy = (value: string): number => {
  if (value.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();

  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  return Array.from(counts.values()).reduce((entropy, count) => {
    const probability = count / value.length;

    return entropy - probability * Math.log2(probability);
  }, 0);
};

const isLikelyNonSecretCandidate = (candidate: string): boolean => {
  if (candidate.includes("/") || candidate.includes("\\")) {
    return true;
  }

  if (/^[A-Za-z]+$/.test(candidate)) {
    return true;
  }

  return false;
};

const hasNearbySecretLabel = (source: string, index: number): boolean => {
  const windowStart = Math.max(0, index - 40);
  const prefix = source.slice(windowStart, index);

  return secretLabelPattern.test(prefix);
};

export const detectEntropyAnomaly = (
  source: string
): SecretEntropyFinding | undefined => {
  for (const match of source.matchAll(entropyCandidatePattern)) {
    const candidate = match[0];
    const index = match.index ?? 0;

    if (candidate.length < 32 || isLikelyNonSecretCandidate(candidate)) {
      continue;
    }

    if (shannonEntropy(candidate) < 4) {
      continue;
    }

    const nearSecretLabel = hasNearbySecretLabel(source, index);

    return {
      nearSecretLabel,
      confidence: nearSecretLabel ? "probable" : "possible"
    };
  }

  return undefined;
};
