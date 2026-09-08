import {
  defaultRedactionReplacement,
  redactionPatterns
} from "./redactionPolicy.js";
import type { RedactionOptions, RedactionResult } from "./redactionTypes.js";

const replacementForMatch = (
  match: string,
  options: RedactionOptions
): string => {
  const replacement = options.replacement ?? defaultRedactionReplacement;

  return options.preserveLength === true
    ? replacement
        .repeat(Math.max(1, Math.ceil(match.length / replacement.length)))
        .slice(0, match.length)
    : replacement;
};

export const redactString = (
  input: string,
  options: RedactionOptions = {}
): RedactionResult<string> => {
  let value = input;
  let redactionCount = 0;
  const matchedPatterns = new Set<string>();

  for (const definition of redactionPatterns) {
    value = value.replace(definition.pattern, (match: string) => {
      redactionCount += 1;

      if (options.includePatternNames !== false) {
        matchedPatterns.add(definition.name);
      }

      return definition.replace(match, replacementForMatch(match, options));
    });
  }

  return {
    value,
    redacted: redactionCount > 0,
    redactionCount,
    matchedPatterns: Array.from(matchedPatterns)
  };
};
