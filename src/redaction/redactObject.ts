import {
  defaultRedactionMaxDepth,
  defaultRedactionReplacement,
  isSensitiveObjectKey
} from "./redactionPolicy.js";
import { redactString } from "./redactString.js";
import type { RedactionOptions, RedactionResult } from "./redactionTypes.js";

const combinePatterns = (...patternLists: string[][]): string[] =>
  Array.from(new Set(patternLists.flat()));

interface RedactionAccumulator {
  redacted: boolean;
  redactionCount: number;
  matchedPatterns: string[];
}

const mergeResult = (
  accumulator: RedactionAccumulator,
  result: RedactionResult<unknown>
): void => {
  accumulator.redacted = accumulator.redacted || result.redacted;
  accumulator.redactionCount += result.redactionCount;
  accumulator.matchedPatterns = combinePatterns(
    accumulator.matchedPatterns,
    result.matchedPatterns
  );
};

const redactValue = (
  input: unknown,
  options: RedactionOptions,
  depth: number,
  parentKey?: string
): RedactionResult<unknown> => {
  const replacement = options.replacement ?? defaultRedactionReplacement;
  const maxDepth = options.maxDepth ?? defaultRedactionMaxDepth;

  if (parentKey !== undefined && isSensitiveObjectKey(parentKey, options)) {
    return {
      value: replacement,
      redacted: true,
      redactionCount: 1,
      matchedPatterns:
        options.includePatternNames === false ? [] : ["sensitive_object_key"]
    };
  }

  if (typeof input === "string") {
    return redactString(input, options);
  }

  if (depth >= maxDepth || input === null || typeof input !== "object") {
    return {
      value: input,
      redacted: false,
      redactionCount: 0,
      matchedPatterns: []
    };
  }

  if (Array.isArray(input)) {
    const accumulator: RedactionAccumulator = {
      redacted: false,
      redactionCount: 0,
      matchedPatterns: []
    };
    const value = input.map((item) => {
      const result = redactValue(item, options, depth + 1);
      mergeResult(accumulator, result);

      return result.value;
    });

    return {
      value,
      ...accumulator
    };
  }

  const accumulator: RedactionAccumulator = {
    redacted: false,
    redactionCount: 0,
    matchedPatterns: []
  };
  const value: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    const result = redactValue(child, options, depth + 1, key);
    mergeResult(accumulator, result);
    value[key] = result.value;
  }

  return {
    value,
    ...accumulator
  };
};

export const redactObject = <T>(
  input: T,
  options: RedactionOptions = {}
): RedactionResult<T> => {
  const result = redactValue(input, options, 0);

  return {
    value: result.value as T,
    redacted: result.redacted,
    redactionCount: result.redactionCount,
    matchedPatterns: result.matchedPatterns
  };
};
