export interface RedactionOptions {
  replacement?: string;
  preserveLength?: boolean;
  redactKeys?: string[];
  maxDepth?: number;
  includePatternNames?: boolean;
}

export interface RedactionResult<T> {
  value: T;
  redacted: boolean;
  redactionCount: number;
  matchedPatterns: string[];
}

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replace(match: string, replacement: string): string;
}
