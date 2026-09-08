import {
  codingActionGatePolicySchema,
  type CodingActionGatePolicy
} from "../domain/policies.js";
import { defaultPolicy } from "../policy/defaultPolicy.js";
import type {
  PolicyTemplate,
  PolicyTemplateName
} from "./policyTemplateTypes.js";

const protectedBranches = ["main", "master", "production", "release/*"];

const createPolicyTemplate = (
  overrides: Omit<Partial<CodingActionGatePolicy>, "version" | "rules"> = {}
): CodingActionGatePolicy =>
  codingActionGatePolicySchema.parse({
    ...defaultPolicy,
    ...overrides,
    version: defaultPolicy.version,
    rules: defaultPolicy.rules
  });

const basicPolicy = createPolicyTemplate({
  workspace: {
    allowedRoots: ["."],
    forbiddenMutationOutsideWorkspace: true
  },
  protectedBranches,
  sensitivePaths: {
    critical: [".env", ".env.*", ".ssh/**", ".aws/**", "secrets/**"],
    high: ["auth/**", "security/**", ".github/workflows/**"]
  },
  validation: {
    beforeCommit: {
      required: false,
      commands: []
    },
    beforePush: {
      required: false,
      commands: []
    }
  },
  thresholds: {
    largeDiffFiles: 8,
    largeDiffLines: 500,
    contextCompletenessMinimum: 0.7,
    sensitiveContextCompletenessMinimum: 0.9,
    maxRetriesSameGoal: 3,
    maxSessionMinutesWithoutProgress: 20
  }
});

const nodePolicy = createPolicyTemplate({
  workspace: {
    allowedRoots: ["."],
    forbiddenMutationOutsideWorkspace: true
  },
  protectedBranches,
  sensitivePaths: {
    critical: [".env", ".env.*", "private.key", "*.pem", "secrets/**"],
    high: [
      "auth/**",
      "security/**",
      ".github/workflows/**",
      "src/auth/**",
      "src/security/**",
      "src/billing/**",
      "src/payments/**",
      "prisma/**",
      "migrations/**"
    ]
  },
  validation: {
    beforeCommit: {
      required: true,
      commands: ["npm test", "npm run lint", "npm run typecheck"]
    },
    beforePush: {
      required: true,
      commands: ["npm test", "npm run build"]
    }
  },
  thresholds: basicPolicy.thresholds
});

const strictPolicy = createPolicyTemplate({
  workspace: {
    allowedRoots: ["."],
    forbiddenMutationOutsideWorkspace: true
  },
  protectedBranches,
  sensitivePaths: {
    critical: [
      ".env",
      ".env.*",
      ".ssh/**",
      ".aws/**",
      ".gcloud/**",
      ".azure/**",
      "kubeconfig",
      "secrets/**",
      "infra/prod/**"
    ],
    high: [
      "auth/**",
      "authorization/**",
      "billing/**",
      "payments/**",
      "security/**",
      "infra/**",
      "db/migrations/**",
      ".github/workflows/**",
      "src/auth/**",
      "src/security/**",
      "src/billing/**",
      "src/payments/**"
    ]
  },
  validation: nodePolicy.validation,
  thresholds: {
    largeDiffFiles: 5,
    largeDiffLines: 300,
    contextCompletenessMinimum: 0.8,
    sensitiveContextCompletenessMinimum: 0.95,
    maxRetriesSameGoal: 2,
    maxSessionMinutesWithoutProgress: 15
  }
});

const monorepoLitePolicy = createPolicyTemplate({
  workspace: {
    allowedRoots: ["."],
    forbiddenMutationOutsideWorkspace: true
  },
  protectedBranches,
  sensitivePaths: {
    critical: basicPolicy.sensitivePaths?.critical,
    high: [
      "apps/*/auth/**",
      "apps/*/billing/**",
      "apps/*/payments/**",
      "apps/*/security/**",
      "packages/*/auth/**",
      "packages/*/security/**",
      "infra/**",
      ".github/workflows/**"
    ]
  },
  validation: {
    beforeCommit: {
      required: true,
      commands: ["npm test", "npm run lint"]
    },
    beforePush: {
      required: true,
      commands: ["npm test", "npm run build"]
    }
  },
  thresholds: {
    largeDiffFiles: 12,
    largeDiffLines: 800,
    contextCompletenessMinimum: 0.7,
    sensitiveContextCompletenessMinimum: 0.9,
    maxRetriesSameGoal: 3,
    maxSessionMinutesWithoutProgress: 20
  }
});

const templates: Record<PolicyTemplateName, PolicyTemplate> = {
  basic: {
    name: "basic",
    description: "General starter policy for individual developers.",
    policy: basicPolicy
  },
  node: {
    name: "node",
    description: "Node/TypeScript project policy with npm validation gates.",
    policy: nodePolicy
  },
  strict: {
    name: "strict",
    description: "Conservative team policy with stricter thresholds.",
    policy: strictPolicy
  },
  "monorepo-lite": {
    name: "monorepo-lite",
    description: "Simple apps/packages monorepo starter policy.",
    policy: monorepoLitePolicy
  }
};

export const policyTemplateNames = Object.keys(
  templates
) as PolicyTemplateName[];

export const listPolicyTemplates = (): PolicyTemplate[] =>
  policyTemplateNames.map((name) => templates[name]);

export const getPolicyTemplate = (name: string): PolicyTemplate | undefined =>
  policyTemplateNames.includes(name as PolicyTemplateName)
    ? templates[name as PolicyTemplateName]
    : undefined;
