import type { UiAuditRecord } from "./types.js";

const baseTimestamp = "2026-05-03T10:00:00.000Z";

export const mockAuditRecords: UiAuditRecord[] = [
  {
    decisionId: "dec_mock_readme_proceed",
    timestamp: "2026-05-03T09:55:00.000Z",
    sessionId: "demo",
    targetPaths: ["README.md"],
    action: {
      id: "act_readme_edit",
      type: "edit_file",
      targetPath: "README.md"
    },
    decision: "PROCEED",
    reason: "README edit is authorized after fresh file observation.",
    evidence: {
      signalSummary: {
        pathSensitivity: "low",
        targetFileFreshness: "fresh",
        contextCompletenessScore: 1,
        destructiveOperation: false
      },
      detectorResults: [
        {
          detectorId: "read-before-write",
          ok: true
        },
        {
          detectorId: "related-context",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "read-before-write",
        matched: false
      },
      {
        ruleId: "require-related-tests",
        matched: false
      }
    ]
  },
  {
    decisionId: "dec_mock_git_status",
    timestamp: baseTimestamp,
    sessionId: "demo",
    action: {
      id: "act_git_status",
      type: "run_command",
      command: "git status"
    },
    decision: "PROCEED",
    reason: "No policy rules required deferral, escalation, or blocking.",
    evidence: {
      signalSummary: {
        commandRiskScore: "low",
        currentBranch: "main",
        protectedBranch: true,
        upstreamBranch: "origin/main",
        isDetachedHead: false,
        isDirtyWorktree: false,
        hasUncommittedChanges: false,
        hasUntrackedFiles: false,
        repoIntegrityStatus: "clean",
        gitCommandCategory: "git_read",
        branchRisk: "low",
        landingAction: false
      },
      detectorResults: [
        {
          detectorId: "command-risk",
          ok: true
        },
        {
          detectorId: "git-workflow",
          ok: true
        },
        {
          detectorId: "landing-gate",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "defer-unknown-git-state",
        matched: false
      }
    ]
  },
  {
    decisionId: "dec_mock_defer",
    timestamp: "2026-05-03T10:05:00.000Z",
    sessionId: "demo",
    action: {
      id: "act_service_edit",
      type: "edit_file",
      targetPath: "src/service.ts"
    },
    decision: "DEFER",
    reason:
      "Target file state is not fresh. Related context has not been sufficiently inspected.",
    deferReasonCategory: "target_file_never_read",
    expectedNextDecision: "PROCEED",
    reanalysisRequired: true,
    evidence: {
      deferredActionId: "def_mock_service_edit",
      signalSummary: {
        pathSensitivity: "low",
        targetFileFreshness: "unknown",
        contextCompletenessScore: 0.5,
        landingAction: false,
        deferReasonCategory: "target_file_never_read",
        expectedNextDecision: "PROCEED",
        reanalysisRequired: true
      },
      detectorResults: [
        {
          detectorId: "read-before-write",
          ok: true
        },
        {
          detectorId: "related-context",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "read-before-write",
        matched: true,
        effect: "DEFER",
        reason: "Target file state is not fresh."
      },
      {
        ruleId: "require-related-tests",
        matched: true,
        effect: "DEFER",
        reason: "Related context has not been sufficiently inspected."
      }
    ],
    missingContext: [
      {
        type: "current_file_contents",
        target: "src/service.ts",
        reason: "Target file has not been observed in this session.",
        required: true
      },
      {
        type: "related_tests",
        target: "src/service.test.ts",
        reason: "Related tests have not been inspected.",
        required: true
      }
    ],
    fetchPlan: [
      {
        type: "read_file",
        target: "src/service.ts",
        safe: true,
        reason: "Read the current target file before retrying authorization."
      },
      {
        type: "read_related_tests",
        target: "src/service.test.ts",
        safe: true,
        reason: "Inspect related tests before modifying this file."
      }
    ],
    riskIfProceeding: [
      "The agent may edit a file it has not inspected.",
      "The proposed change may overwrite unknown current content."
    ]
  },
  {
    decisionId: "dec_mock_validation_defer",
    timestamp: "2026-05-03T10:07:00.000Z",
    sessionId: "demo",
    action: {
      id: "act_commit_before_validation",
      type: "run_command",
      command: "git commit -m test"
    },
    decision: "DEFER",
    reason: "Required validation has not been run.",
    deferReasonCategory: "validation_not_run",
    expectedNextDecision: "PROCEED",
    reanalysisRequired: true,
    evidence: {
      deferredActionId: "def_mock_commit_validation",
      signalSummary: {
        commandRiskScore: "medium",
        validationRequired: true,
        validationStatus: "not_run",
        validationScope: "before_commit",
        requiredValidationCommands: ['node -e "process.exit(0)"'],
        validationPolicyMatch: "validation.beforeCommit",
        validationReason:
          "Required validation has not been run for before_commit.",
        currentBranch: "feature/ui",
        protectedBranch: false,
        branchRisk: "low",
        isDirtyWorktree: false,
        gitCommandCategory: "git_commit",
        landingAction: true,
        landingActionType: "commit",
        landingRisk: "medium",
        landingReason: "Landing action is missing fresh validation.",
        requiresValidation: true
      },
      detectorResults: [
        {
          detectorId: "git-workflow",
          ok: true
        },
        {
          detectorId: "validation-gate",
          ok: true
        },
        {
          detectorId: "landing-gate",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "require-validation-before-commit",
        matched: true,
        effect: "DEFER",
        reason: "Required validation has not passed before commit."
      }
    ],
    missingContext: [
      {
        type: "validation_result",
        reason: "Required validation has not been run.",
        required: true
      }
    ],
    fetchPlan: [
      {
        type: "run_validation",
        validationKind: "other",
        command: 'node -e "process.exit(0)"',
        safe: true,
        reason: "Run required validation before retrying authorization."
      }
    ],
    riskIfProceeding: [
      "The change may be committed or landed without evidence that it works."
    ]
  },
  {
    decisionId: "dec_mock_escalate",
    timestamp: "2026-05-03T10:10:00.000Z",
    sessionId: "demo",
    targetPaths: ["auth/service.ts"],
    action: {
      id: "act_main_commit",
      type: "run_command",
      command: "git commit -m test"
    },
    decision: "ESCALATE",
    reason: "Direct commit on a protected branch requires human approval.",
    evidence: {
      signalSummary: {
        pathSensitivity: "high",
        targetFileFreshness: "fresh",
        commandRiskScore: "medium",
        validationRequired: true,
        validationStatus: "passed",
        latestValidationCommand: 'node -e "process.exit(0)"',
        latestValidationExitCode: 0,
        currentBranch: "main",
        protectedBranch: true,
        branchRisk: "high",
        directMainlineCommit: true,
        landingAction: true,
        landingActionType: "commit",
        landingRisk: "high"
      },
      detectorResults: [
        {
          detectorId: "sensitive-path",
          ok: true
        },
        {
          detectorId: "git-workflow",
          ok: true
        },
        {
          detectorId: "validation-gate",
          ok: true
        },
        {
          detectorId: "landing-gate",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "escalate-sensitive-change",
        matched: true,
        effect: "ESCALATE",
        reason: "Sensitive path changes require human review."
      },
      {
        ruleId: "escalate-direct-mainline-commit",
        matched: true,
        effect: "ESCALATE",
        reason: "Direct commit on a protected branch requires human approval."
      }
    ]
  },
  {
    decisionId: "dec_mock_secret_block",
    timestamp: "2026-05-03T10:12:00.000Z",
    sessionId: "demo",
    action: {
      id: "act_read_env",
      type: "read_file",
      targetPath: ".env"
    },
    decision: "BLOCK",
    reason: "Secret-bearing files may not be read.",
    evidence: {
      signalSummary: {
        pathSensitivity: "critical",
        secretTouch: true,
        workspaceBoundaryViolation: false
      },
      detectorResults: [
        {
          detectorId: "secret-detector",
          ok: true
        },
        {
          detectorId: "sensitive-path",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "block-secret-read",
        matched: true,
        effect: "BLOCK",
        reason: "Secret-bearing files may not be read."
      }
    ]
  },
  {
    decisionId: "dec_mock_block",
    timestamp: "2026-05-03T10:15:00.000Z",
    sessionId: "demo",
    action: {
      id: "act_push_main",
      type: "run_command",
      command: "git push origin main"
    },
    decision: "BLOCK",
    reason: "Direct push to a protected branch is prohibited.",
    evidence: {
      signalSummary: {
        commandRiskScore: "unknown",
        validationRequired: true,
        validationStatus: "not_run",
        currentBranch: "feature/ui",
        protectedBranch: false,
        branchRisk: "critical",
        landingAction: true,
        landingActionType: "push",
        landingRisk: "critical"
      },
      detectorResults: [
        {
          detectorId: "git-workflow",
          ok: true
        },
        {
          detectorId: "validation-gate",
          ok: true
        },
        {
          detectorId: "landing-gate",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "block-protected-branch-push",
        matched: true,
        effect: "BLOCK",
        reason: "Direct push to a protected branch is prohibited."
      },
      {
        ruleId: "block-critical-landing-action",
        matched: true,
        effect: "BLOCK",
        reason: "Critical-risk landing action is prohibited."
      }
    ]
  },
  {
    decisionId: "dec_mock_prod_deploy_block",
    timestamp: "2026-05-03T10:18:00.000Z",
    sessionId: "demo",
    action: {
      id: "act_vercel_prod",
      type: "run_command",
      command: "vercel deploy --prod"
    },
    decision: "BLOCK",
    reason: "Critical-risk landing action is prohibited.",
    evidence: {
      signalSummary: {
        commandRiskScore: "unknown",
        landingAction: true,
        landingActionType: "deploy",
        landingRisk: "critical",
        landingReason: "Production deployment is a critical landing action.",
        requiresValidation: true,
        requiresCleanWorktree: true,
        requiresHumanApproval: true,
        deploymentRisk: "critical",
        environmentClassification: "production"
      },
      detectorResults: [
        {
          detectorId: "landing-gate",
          ok: true
        }
      ]
    },
    policyTrace: [
      {
        ruleId: "block-critical-landing-action",
        matched: true,
        effect: "BLOCK",
        reason: "Critical-risk landing action is prohibited."
      }
    ]
  }
];
