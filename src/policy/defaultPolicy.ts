import {
  codingActionGatePolicySchema,
  type CodingActionGatePolicy
} from "../domain/policies.js";

export const defaultPolicy: CodingActionGatePolicy =
  codingActionGatePolicySchema.parse({
    version: "0.1",
    workspace: {
      allowedRoots: ["."],
      forbiddenMutationOutsideWorkspace: true
    },
    protectedBranches: ["main", "master", "production", "release/*"],
    sensitivePaths: {
      critical: [
        ".env",
        ".env.*",
        ".ssh/**",
        ".aws/**",
        ".gcloud/**",
        ".azure/**",
        "secrets/**",
        "*.pem",
        "*.key"
      ],
      high: [
        "auth/**",
        "billing/**",
        "payments/**",
        "security/**",
        "infra/prod/**",
        "db/migrations/**",
        ".github/workflows/**"
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
    thresholds: {
      largeDiffFiles: 8,
      largeDiffLines: 500,
      contextCompletenessMinimum: 0.7,
      sensitiveContextCompletenessMinimum: 0.9,
      maxRetriesSameGoal: 3,
      maxSessionMinutesWithoutProgress: 20
    },
    rules: [
      {
        id: "read-before-write",
        decision: "DEFER",
        when: {
          action_type: ["edit_file", "write_file", "delete_file"],
          target_file_freshness: ["stale", "unknown", "missing"]
        },
        reason: "Target file state is not fresh."
      },
      {
        id: "block-workspace-escape",
        decision: "BLOCK",
        when: {
          workspace_boundary_violation: true,
          mutates_filesystem: true
        },
        reason: "Mutation escapes allowed workspace roots."
      },
      {
        id: "block-critical-command",
        decision: "BLOCK",
        when: {
          command_risk_score: ["critical"]
        },
        reason: "Critical-risk shell command is prohibited."
      },
      {
        id: "escalate-high-risk-command",
        decision: "ESCALATE",
        when: {
          command_risk_score: ["high"]
        },
        reason: "High-risk shell command requires human approval."
      },
      {
        id: "escalate-destructive-file-change",
        decision: "ESCALATE",
        when: {
          destructive_operation: true,
          mutates_filesystem: true
        },
        reason: "Destructive filesystem changes require human review."
      },
      {
        id: "escalate-sensitive-change",
        decision: "ESCALATE",
        when: {
          path_sensitivity: ["high", "critical"],
          action_type: ["edit_file", "write_file", "delete_file"]
        },
        reason: "Sensitive path changes require human review."
      },
      {
        id: "block-secret-content-in-mutation",
        decision: "BLOCK",
        when: {
          secret_touch: ["probable", "confirmed"],
          mutates_filesystem: true
        },
        reason: "Proposed mutation appears to contain secret material."
      },
      {
        id: "block-secret-read",
        decision: "BLOCK",
        when: {
          secret_touch: ["probable", "confirmed"],
          action_type: ["read_file", "run_command"]
        },
        reason: "Secret-bearing inputs require masking or explicit approval."
      },
      {
        id: "require-validation-before-commit",
        decision: "DEFER",
        when: {
          validation_required: true,
          validation_scope: ["before_commit"],
          validation_status: ["not_run", "stale"]
        },
        reason: "Required validation has not passed before commit."
      },
      {
        id: "require-validation-before-push",
        decision: "DEFER",
        when: {
          validation_required: true,
          validation_scope: ["before_push"],
          validation_status: ["not_run", "stale"]
        },
        reason: "Required validation has not passed before push."
      },
      {
        id: "block-failed-validation-before-commit",
        decision: "BLOCK",
        when: {
          validation_required: true,
          validation_scope: ["before_commit"],
          validation_status: ["failed"]
        },
        reason: "Required validation failed before commit."
      },
      {
        id: "block-failed-validation-before-push",
        decision: "BLOCK",
        when: {
          validation_required: true,
          validation_scope: ["before_push"],
          validation_status: ["failed"]
        },
        reason: "Required validation failed before push."
      },
      {
        id: "require-related-tests",
        decision: "DEFER",
        when: {
          context_completeness_score: "<0.70"
        },
        reason: "Related context has not been sufficiently inspected."
      },
      {
        id: "block-force-push",
        decision: "BLOCK",
        when: {
          force_push: true
        },
        reason: "Force push is prohibited."
      },
      {
        id: "block-hook-bypass",
        decision: "BLOCK",
        when: {
          hook_bypass: true
        },
        reason: "Hook bypass is prohibited."
      },
      {
        id: "block-protected-branch-push",
        decision: "BLOCK",
        when: {
          direct_mainline_push: true
        },
        reason: "Direct push to a protected branch is prohibited."
      },
      {
        id: "escalate-direct-mainline-commit",
        decision: "ESCALATE",
        when: {
          direct_mainline_commit: true
        },
        reason: "Direct commit on a protected branch requires human approval."
      },
      {
        id: "defer-unknown-git-state",
        decision: "DEFER",
        when: {
          branch_risk: ["unknown"]
        },
        reason: "Git state is unknown."
      },
      {
        id: "block-critical-landing-action",
        decision: "BLOCK",
        when: {
          landing_risk: ["critical"]
        },
        reason: "Critical-risk landing action is prohibited."
      },
      {
        id: "escalate-high-risk-landing-action",
        decision: "ESCALATE",
        when: {
          landing_risk: ["high"]
        },
        reason: "High-risk landing action requires human approval."
      },
      {
        id: "defer-landing-with-unknown-state",
        decision: "DEFER",
        when: {
          landing_action: true,
          landing_risk: ["unknown"]
        },
        reason: "Landing action state is unknown."
      },
      {
        id: "pause-runaway-session",
        decision: "DEFER",
        when: {
          autonomy_budget_status: ["exceeded"]
        },
        reason: "Retry, time, or token budget exceeded."
      }
    ]
  });
