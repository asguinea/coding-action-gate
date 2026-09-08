import type { UiPolicy, UiPolicySource } from "./types.js";

export const mockPolicy: UiPolicy = {
  version: "0.1",
  protectedBranches: ["main", "master", "production", "release/*"],
  sensitivePaths: {
    critical: [".env", ".env.*", "secrets/**", "*.pem", "*.key"],
    high: ["auth/**", "billing/**", "payments/**", ".github/workflows/**"]
  },
  validation: {
    beforeCommit: {
      required: true,
      commands: ['node -e "process.exit(0)"']
    },
    beforePush: {
      required: true,
      commands: ['node -e "process.exit(0)"']
    }
  },
  thresholds: {
    largeDiffFiles: 8,
    largeDiffLines: 500,
    contextCompletenessMinimum: 0.7,
    maxRetriesSameGoal: 3
  },
  rules: [
    {
      id: "read-before-write",
      decision: "DEFER",
      when: {
        target_file_freshness: ["stale", "unknown", "missing"]
      },
      reason: "Target file state is not fresh."
    },
    {
      id: "escalate-sensitive-change",
      decision: "ESCALATE",
      when: {
        path_sensitivity: ["high", "critical"]
      },
      reason: "Sensitive path changes require human review."
    },
    {
      id: "block-critical-landing-action",
      decision: "BLOCK",
      when: {
        landing_risk: ["critical"]
      },
      reason: "Critical-risk landing action is prohibited."
    }
  ]
};

export const mockPolicySource: UiPolicySource = {
  type: "default",
  version: "0.1"
};
