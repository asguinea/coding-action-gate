import { readFile } from "node:fs/promises";
import path from "node:path";
import { isMap, parseDocument } from "yaml";
import { ZodError } from "zod";
import {
  codingActionGatePolicySchema,
  type CodingActionGatePolicy
} from "../domain/policies.js";
import { defaultPolicy } from "./defaultPolicy.js";
import { findPolicyFile } from "./policyDiscovery.js";
import {
  createPolicyLoadError,
  type LoadedPolicyResult,
  type LoadedPolicySource,
  type PolicyLoadError
} from "./policyErrors.js";

export interface LoadPolicyOptions {
  explicitPath?: string;
  cwd?: string;
  useDefaultFallback?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPolicyLoadError = (value: unknown): value is PolicyLoadError =>
  isRecord(value) &&
  typeof value.code === "string" &&
  typeof value.message === "string";

const normalizeObjectKeys = (
  source: Record<string, unknown>,
  keyMap: Record<string, string>
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = { ...source };

  for (const [from, to] of Object.entries(keyMap)) {
    if (Object.prototype.hasOwnProperty.call(source, from)) {
      normalized[to] = source[from];
      delete normalized[from];
    }
  }

  return normalized;
};

export const normalizePolicyInput = (input: unknown): unknown => {
  if (!isRecord(input)) {
    return input;
  }

  const normalized = normalizeObjectKeys(input, {
    protected_branches: "protectedBranches",
    sensitive_paths: "sensitivePaths"
  });

  if (typeof normalized.version === "number") {
    normalized.version = String(normalized.version);
  }

  if (isRecord(normalized.workspace)) {
    normalized.workspace = normalizeObjectKeys(normalized.workspace, {
      allowed_roots: "allowedRoots",
      forbidden_mutation_outside_workspace: "forbiddenMutationOutsideWorkspace"
    });
  }

  if (isRecord(normalized.validation)) {
    normalized.validation = normalizeObjectKeys(normalized.validation, {
      before_commit: "beforeCommit",
      before_push: "beforePush"
    });
  }

  if (isRecord(normalized.thresholds)) {
    normalized.thresholds = normalizeObjectKeys(normalized.thresholds, {
      large_diff_files: "largeDiffFiles",
      large_diff_lines: "largeDiffLines",
      context_completeness_minimum: "contextCompletenessMinimum",
      sensitive_context_completeness_minimum:
        "sensitiveContextCompletenessMinimum",
      max_retries_same_goal: "maxRetriesSameGoal",
      max_session_minutes_without_progress: "maxSessionMinutesWithoutProgress"
    });
  }

  return normalized;
};

const readPolicyFile = async (
  filePath: string
): Promise<string | PolicyLoadError> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return createPolicyLoadError(
        "POLICY_FILE_NOT_FOUND",
        `Policy file was not found: ${filePath}`,
        { path: filePath, details: error }
      );
    }

    return createPolicyLoadError(
      "POLICY_FILE_READ_ERROR",
      `Policy file could not be read: ${filePath}`,
      { path: filePath, details: error }
    );
  }
};

const parseYamlPolicy = (
  content: string,
  filePath: string
): unknown | PolicyLoadError => {
  try {
    const document = parseDocument(content, {
      prettyErrors: false
    });

    if (document.errors.length > 0) {
      return createPolicyLoadError(
        "POLICY_PARSE_ERROR",
        `Policy file contains invalid YAML: ${filePath}`,
        { path: filePath, details: document.errors }
      );
    }

    if (document.contents !== null && !isMap(document.contents)) {
      return createPolicyLoadError(
        "POLICY_PARSE_ERROR",
        `Policy file must contain a YAML mapping: ${filePath}`,
        { path: filePath }
      );
    }

    return document.toJSON();
  } catch (error) {
    return createPolicyLoadError(
      "POLICY_PARSE_ERROR",
      `Policy file contains invalid YAML: ${filePath}`,
      { path: filePath, details: error }
    );
  }
};

const validatePolicy = (
  input: unknown,
  filePath: string
): CodingActionGatePolicy | PolicyLoadError => {
  const result = codingActionGatePolicySchema.safeParse(
    normalizePolicyInput(input)
  );

  if (result.success) {
    return result.data;
  }

  return createPolicyLoadError(
    "POLICY_VALIDATION_ERROR",
    `Policy file failed schema validation: ${filePath}`,
    {
      path: filePath,
      details:
        result.error instanceof ZodError ? result.error.issues : result.error
    }
  );
};

const loadPolicyFromPath = async (
  filePath: string,
  source: LoadedPolicySource
): Promise<LoadedPolicyResult> => {
  const content = await readPolicyFile(filePath);

  if (typeof content !== "string") {
    return {
      ok: false,
      error: content
    };
  }

  const parsed = parseYamlPolicy(content, filePath);

  if (isPolicyLoadError(parsed)) {
    return {
      ok: false,
      error: parsed
    };
  }

  const validated = validatePolicy(parsed, filePath);

  if (isPolicyLoadError(validated)) {
    return {
      ok: false,
      error: validated
    };
  }

  return {
    ok: true,
    policy: validated,
    source
  };
};

export const loadPolicy = async (
  options: LoadPolicyOptions = {}
): Promise<LoadedPolicyResult> => {
  const cwd = options.cwd ?? process.cwd();

  if (options.explicitPath !== undefined) {
    const explicitPath = path.isAbsolute(options.explicitPath)
      ? options.explicitPath
      : path.resolve(cwd, options.explicitPath);

    return loadPolicyFromPath(explicitPath, {
      type: "explicit",
      path: explicitPath
    });
  }

  const discoveredPath = await findPolicyFile(cwd);

  if (discoveredPath !== null) {
    return loadPolicyFromPath(discoveredPath, {
      type: "discovered",
      path: discoveredPath
    });
  }

  if (options.useDefaultFallback === false) {
    return {
      ok: false,
      error: createPolicyLoadError(
        "POLICY_FILE_NOT_FOUND",
        `No CodingActionGate policy file found in ${path.resolve(cwd)}`
      )
    };
  }

  return {
    ok: true,
    policy: defaultPolicy,
    source: {
      type: "default"
    }
  };
};

export type { LoadedPolicyResult, PolicyLoadError };
