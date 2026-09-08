import {
  uncertaintyDimensions,
  uncertaintyReductionPlanSchema,
  uncertaintyReductionPlanSchemaVersion,
  type UncertaintyDimension,
  type UncertaintyDimensionsRecord,
  type UncertaintyReductionExpectedNextDecision,
  type UncertaintyReductionPlan,
  type UncertaintyReductionPriority,
  type UncertaintyReductionStep,
  type UncertaintyReductionStepKind
} from "./uncertaintyTypes.js";

interface StepSpec {
  kind: UncertaintyReductionStepKind;
  reduces: UncertaintyDimension[];
  driversAddressed: string[];
  requiredEvidence: string[];
  rationale: string;
  priority: UncertaintyReductionPriority;
}

const driverStepMap: Record<string, StepSpec[]> = {
  target_file_not_observed: [
    {
      kind: "read_target_file",
      reduces: ["context", "freshness"],
      driversAddressed: ["target_file_not_observed"],
      requiredEvidence: ["target_file_observed", "target_file_hash_available"],
      rationale: "read_target_file_rationale",
      priority: "high"
    }
  ],
  target_file_freshness_unknown: [
    {
      kind: "read_target_file",
      reduces: ["context", "freshness"],
      driversAddressed: ["target_file_freshness_unknown"],
      requiredEvidence: ["target_file_observed", "target_file_hash_available"],
      rationale: "read_target_file_rationale",
      priority: "high"
    }
  ],
  target_file_stale: [
    {
      kind: "refresh_target_file",
      reduces: ["freshness"],
      driversAddressed: ["target_file_stale"],
      requiredEvidence: ["target_file_observed", "target_file_hash_available"],
      rationale: "refresh_target_file_rationale",
      priority: "high"
    }
  ],
  target_file_hash_changed: [
    {
      kind: "refresh_target_file",
      reduces: ["freshness"],
      driversAddressed: ["target_file_hash_changed"],
      requiredEvidence: ["target_file_observed", "target_file_hash_available"],
      rationale: "refresh_target_file_rationale",
      priority: "high"
    }
  ],
  related_tests_not_observed: [
    {
      kind: "read_related_tests",
      reduces: ["context", "validation"],
      driversAddressed: ["related_tests_not_observed"],
      requiredEvidence: ["related_tests_observed"],
      rationale: "read_related_tests_rationale",
      priority: "high"
    }
  ],
  context_completeness_low: [
    {
      kind: "inspect_related_context",
      reduces: ["context"],
      driversAddressed: ["context_completeness_low"],
      requiredEvidence: ["related_context_observed"],
      rationale: "inspect_related_context_rationale",
      priority: "high"
    }
  ],
  context_completeness_medium: [
    {
      kind: "inspect_related_context",
      reduces: ["context"],
      driversAddressed: ["context_completeness_medium"],
      requiredEvidence: ["related_context_observed"],
      rationale: "inspect_related_context_rationale",
      priority: "medium"
    }
  ],
  validation_missing: [
    {
      kind: "run_validation",
      reduces: ["validation"],
      driversAddressed: ["validation_missing"],
      requiredEvidence: ["validation_result_available"],
      rationale: "run_validation_rationale",
      priority: "high"
    }
  ],
  validation_stale: [
    {
      kind: "run_validation",
      reduces: ["validation"],
      driversAddressed: ["validation_stale"],
      requiredEvidence: ["validation_result_available"],
      rationale: "run_validation_rationale",
      priority: "high"
    }
  ],
  validation_target_unclear: [
    {
      kind: "inspect_validation_config",
      reduces: ["validation"],
      driversAddressed: ["validation_target_unclear"],
      requiredEvidence: ["validation_target_classified"],
      rationale: "inspect_validation_config_rationale",
      priority: "medium"
    }
  ],
  validation_failed: [
    {
      kind: "inspect_validation_failure",
      reduces: ["validation"],
      driversAddressed: ["validation_failed"],
      requiredEvidence: ["validation_result_failed"],
      rationale: "inspect_validation_failure_rationale",
      priority: "critical"
    },
    {
      kind: "fix_validation_failure_before_retry",
      reduces: ["validation"],
      driversAddressed: ["validation_failed"],
      requiredEvidence: ["validation_result_available"],
      rationale: "fix_validation_failure_before_retry_rationale",
      priority: "critical"
    }
  ],
  command_classification_unknown: [
    {
      kind: "classify_command",
      reduces: ["command"],
      driversAddressed: ["command_classification_unknown"],
      requiredEvidence: ["command_classified"],
      rationale: "classify_command_rationale",
      priority: "medium"
    }
  ],
  package_script_unknown: [
    {
      kind: "inspect_package_script",
      reduces: ["command", "environment"],
      driversAddressed: ["package_script_unknown"],
      requiredEvidence: ["package_script_classified"],
      rationale: "inspect_package_script_rationale",
      priority: "medium"
    }
  ],
  package_script_classification_missing: [
    {
      kind: "inspect_package_script",
      reduces: ["command", "environment"],
      driversAddressed: ["package_script_classification_missing"],
      requiredEvidence: ["package_script_classified"],
      rationale: "inspect_package_script_rationale",
      priority: "medium"
    }
  ],
  command_risk_high: [
    {
      kind: "classify_command",
      reduces: ["command"],
      driversAddressed: ["command_risk_high"],
      requiredEvidence: ["command_classified"],
      rationale: "classify_command_rationale",
      priority: "high"
    }
  ],
  command_risk_critical: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["command"],
      driversAddressed: ["command_risk_critical"],
      requiredEvidence: [],
      rationale: "critical_command_human_review_rationale",
      priority: "critical"
    }
  ],
  pipe_to_shell_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["command"],
      driversAddressed: ["pipe_to_shell_detected"],
      requiredEvidence: [],
      rationale: "critical_command_human_review_rationale",
      priority: "critical"
    }
  ],
  privileged_command_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["command"],
      driversAddressed: ["privileged_command_detected"],
      requiredEvidence: [],
      rationale: "privileged_command_human_review_rationale",
      priority: "high"
    }
  ],
  destructive_command_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["command", "recovery"],
      driversAddressed: ["destructive_command_detected"],
      requiredEvidence: [],
      rationale: "destructive_command_human_review_rationale",
      priority: "critical"
    }
  ],
  deployment_command_detected: [
    {
      kind: "inspect_environment",
      reduces: ["environment"],
      driversAddressed: ["deployment_command_detected"],
      requiredEvidence: ["environment_classified"],
      rationale: "inspect_environment_rationale",
      priority: "high"
    },
    {
      kind: "confirm_deploy_target",
      reduces: ["environment"],
      driversAddressed: ["deployment_command_detected"],
      requiredEvidence: ["deploy_target_classified"],
      rationale: "confirm_deploy_target_rationale",
      priority: "high"
    }
  ],
  sensitive_path_detected: [
    {
      kind: "inspect_related_context",
      reduces: ["context", "sensitivity"],
      driversAddressed: ["sensitive_path_detected"],
      requiredEvidence: ["related_context_observed"],
      rationale: "sensitive_context_rationale",
      priority: "high"
    }
  ],
  sensitive_surface_detected: [
    {
      kind: "read_related_tests",
      reduces: ["context", "sensitivity"],
      driversAddressed: ["sensitive_surface_detected"],
      requiredEvidence: ["related_tests_observed"],
      rationale: "sensitive_tests_rationale",
      priority: "high"
    }
  ],
  sensitive_context_missing: [
    {
      kind: "read_target_file",
      reduces: ["context", "freshness", "sensitivity"],
      driversAddressed: ["sensitive_context_missing"],
      requiredEvidence: ["target_file_observed", "sensitive_context_available"],
      rationale: "sensitive_context_rationale",
      priority: "high"
    },
    {
      kind: "inspect_related_context",
      reduces: ["context", "sensitivity"],
      driversAddressed: ["sensitive_context_missing"],
      requiredEvidence: ["related_context_observed"],
      rationale: "sensitive_context_rationale",
      priority: "high"
    }
  ],
  sensitive_surface_context_incomplete: [
    {
      kind: "inspect_related_context",
      reduces: ["context", "sensitivity"],
      driversAddressed: ["sensitive_surface_context_incomplete"],
      requiredEvidence: ["related_context_observed"],
      rationale: "sensitive_context_rationale",
      priority: "high"
    },
    {
      kind: "read_related_tests",
      reduces: ["context", "validation", "sensitivity"],
      driversAddressed: ["sensitive_surface_context_incomplete"],
      requiredEvidence: ["related_tests_observed"],
      rationale: "sensitive_tests_rationale",
      priority: "high"
    }
  ],
  sensitive_validation_missing: [
    {
      kind: "run_validation",
      reduces: ["validation", "sensitivity"],
      driversAddressed: ["sensitive_validation_missing"],
      requiredEvidence: ["validation_result_available"],
      rationale: "run_validation_rationale",
      priority: "high"
    }
  ],
  sensitive_change_review_required: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["sensitivity"],
      driversAddressed: ["sensitive_change_review_required"],
      requiredEvidence: [],
      rationale: "sensitive_human_review_rationale",
      priority: "high"
    }
  ],
  secret_path_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["sensitivity"],
      driversAddressed: ["secret_path_detected"],
      requiredEvidence: [],
      rationale: "secret_human_review_rationale",
      priority: "critical"
    }
  ],
  secret_pattern_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["sensitivity"],
      driversAddressed: ["secret_pattern_detected"],
      requiredEvidence: [],
      rationale: "secret_human_review_rationale",
      priority: "critical"
    }
  ],
  secret_material_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["sensitivity"],
      driversAddressed: ["secret_material_detected"],
      requiredEvidence: [],
      rationale: "secret_human_review_rationale",
      priority: "critical"
    }
  ],
  workspace_boundary_unknown: [
    {
      kind: "inspect_workspace_boundary",
      reduces: ["workspace_boundary"],
      driversAddressed: ["workspace_boundary_unknown"],
      requiredEvidence: ["workspace_boundary_checked"],
      rationale: "inspect_workspace_boundary_rationale",
      priority: "medium"
    }
  ],
  workspace_boundary_violation: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["workspace_boundary"],
      driversAddressed: ["workspace_boundary_violation"],
      requiredEvidence: [],
      rationale: "workspace_boundary_human_review_rationale",
      priority: "critical"
    }
  ],
  protected_branch_risk: [
    {
      kind: "inspect_branch_policy",
      reduces: ["git_workflow"],
      driversAddressed: ["protected_branch_risk"],
      requiredEvidence: ["git_state_available"],
      rationale: "inspect_branch_policy_rationale",
      priority: "high"
    }
  ],
  direct_mainline_risk: [
    {
      kind: "inspect_git_state",
      reduces: ["git_workflow"],
      driversAddressed: ["direct_mainline_risk"],
      requiredEvidence: ["git_state_available"],
      rationale: "inspect_git_state_rationale",
      priority: "high"
    }
  ],
  landing_action_detected: [
    {
      kind: "run_validation",
      reduces: ["git_workflow", "validation"],
      driversAddressed: ["landing_action_detected"],
      requiredEvidence: ["validation_result_available"],
      rationale: "landing_validation_rationale",
      priority: "high"
    }
  ],
  force_push_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["git_workflow"],
      driversAddressed: ["force_push_detected"],
      requiredEvidence: [],
      rationale: "force_push_human_review_rationale",
      priority: "critical"
    }
  ],
  hook_bypass_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["git_workflow"],
      driversAddressed: ["hook_bypass_detected"],
      requiredEvidence: [],
      rationale: "hook_bypass_human_review_rationale",
      priority: "critical"
    }
  ],
  environment_unknown: [
    {
      kind: "inspect_environment",
      reduces: ["environment"],
      driversAddressed: ["environment_unknown"],
      requiredEvidence: ["environment_classified"],
      rationale: "inspect_environment_rationale",
      priority: "high"
    }
  ],
  environment_classification_missing: [
    {
      kind: "inspect_environment",
      reduces: ["environment"],
      driversAddressed: ["environment_classification_missing"],
      requiredEvidence: ["environment_classified"],
      rationale: "inspect_environment_rationale",
      priority: "high"
    }
  ],
  deploy_target_ambiguous: [
    {
      kind: "confirm_deploy_target",
      reduces: ["environment"],
      driversAddressed: ["deploy_target_ambiguous"],
      requiredEvidence: ["deploy_target_classified", "environment_classified"],
      rationale: "confirm_deploy_target_rationale",
      priority: "high"
    }
  ],
  production_environment_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["environment"],
      driversAddressed: ["production_environment_detected"],
      requiredEvidence: [],
      rationale: "production_environment_human_review_rationale",
      priority: "critical"
    }
  ],
  environment_risk_critical: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["environment"],
      driversAddressed: ["environment_risk_critical"],
      requiredEvidence: [],
      rationale: "production_environment_human_review_rationale",
      priority: "critical"
    }
  ],
  environment_risk_high: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["environment"],
      driversAddressed: ["environment_risk_high"],
      requiredEvidence: [],
      rationale: "environment_human_review_rationale",
      priority: "high"
    }
  ],
  release_surface_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["environment"],
      driversAddressed: ["release_surface_detected"],
      requiredEvidence: [],
      rationale: "release_surface_human_review_rationale",
      priority: "critical"
    }
  ],
  package_publish_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["environment"],
      driversAddressed: ["package_publish_detected"],
      requiredEvidence: [],
      rationale: "publish_surface_human_review_rationale",
      priority: "critical"
    }
  ],
  publish_surface_detected: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["environment"],
      driversAddressed: ["publish_surface_detected"],
      requiredEvidence: [],
      rationale: "publish_surface_human_review_rationale",
      priority: "critical"
    }
  ],
  recovery_state_unknown: [
    {
      kind: "inspect_recovery_state",
      reduces: ["recovery"],
      driversAddressed: ["recovery_state_unknown"],
      requiredEvidence: ["recovery_state_classified"],
      rationale: "inspect_recovery_state_rationale",
      priority: "high"
    }
  ],
  destructive_operation_recovery_unknown: [
    {
      kind: "inspect_recovery_state",
      reduces: ["recovery"],
      driversAddressed: ["destructive_operation_recovery_unknown"],
      requiredEvidence: ["recovery_state_classified"],
      rationale: "inspect_recovery_state_rationale",
      priority: "high"
    },
    {
      kind: "create_checkpoint",
      reduces: ["recovery"],
      driversAddressed: ["destructive_operation_recovery_unknown"],
      requiredEvidence: ["recovery_checkpoint_available"],
      rationale: "create_checkpoint_rationale",
      priority: "high"
    }
  ],
  recovery_checkpoint_missing: [
    {
      kind: "create_checkpoint",
      reduces: ["recovery"],
      driversAddressed: ["recovery_checkpoint_missing"],
      requiredEvidence: ["recovery_checkpoint_available"],
      rationale: "create_checkpoint_rationale",
      priority: "high"
    }
  ],
  git_tracking_unknown: [
    {
      kind: "inspect_git_state",
      reduces: ["git_workflow", "recovery"],
      driversAddressed: ["git_tracking_unknown"],
      requiredEvidence: ["git_state_available", "git_tracking_available"],
      rationale: "inspect_git_state_rationale",
      priority: "medium"
    }
  ],
  workspace_recovery_boundary_unknown: [
    {
      kind: "inspect_workspace_boundary",
      reduces: ["workspace_boundary", "recovery"],
      driversAddressed: ["workspace_recovery_boundary_unknown"],
      requiredEvidence: ["workspace_boundary_checked"],
      rationale: "inspect_workspace_boundary_rationale",
      priority: "high"
    }
  ],
  validation_recovery_evidence_missing: [
    {
      kind: "run_validation",
      reduces: ["validation", "recovery"],
      driversAddressed: ["validation_recovery_evidence_missing"],
      requiredEvidence: ["validation_result_available"],
      rationale: "run_validation_rationale",
      priority: "medium"
    }
  ],
  irreversible_operation_risk: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["recovery"],
      driversAddressed: ["irreversible_operation_risk"],
      requiredEvidence: [],
      rationale: "irreversible_operation_human_review_rationale",
      priority: "critical"
    }
  ],
  autonomy_budget_unknown: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["autonomy_budget_unknown"],
      requiredEvidence: [
        "action_scope_classified",
        "autonomy_budget_available"
      ],
      rationale: "narrow_action_scope_rationale",
      priority: "medium"
    }
  ],
  autonomy_budget_not_tracked: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["autonomy_budget_not_tracked"],
      requiredEvidence: [
        "action_scope_classified",
        "autonomy_budget_available"
      ],
      rationale: "narrow_action_scope_rationale",
      priority: "medium"
    }
  ],
  autonomy_budget_warning: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["autonomy_budget_warning"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "refresh_context",
      reduces: ["context", "autonomy_budget"],
      driversAddressed: ["autonomy_budget_warning"],
      requiredEvidence: ["progress_state_available"],
      rationale: "refresh_context_rationale",
      priority: "medium"
    },
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["autonomy_budget_warning"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "medium"
    }
  ],
  autonomy_budget_exceeded: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["autonomy_budget"],
      driversAddressed: ["autonomy_budget_exceeded"],
      requiredEvidence: [],
      rationale: "autonomy_budget_human_review_rationale",
      priority: "critical"
    }
  ],
  retry_count_high: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["retry_count_high"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "limit_retry_scope",
      reduces: ["autonomy_budget"],
      driversAddressed: ["retry_count_high"],
      requiredEvidence: ["retry_count_available", "progress_state_available"],
      rationale: "limit_retry_scope_rationale",
      priority: "medium"
    }
  ],
  retry_budget_warning: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["retry_budget_warning"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "limit_retry_scope",
      reduces: ["autonomy_budget"],
      driversAddressed: ["retry_budget_warning"],
      requiredEvidence: ["retry_count_available", "progress_state_available"],
      rationale: "limit_retry_scope_rationale",
      priority: "medium"
    },
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["retry_budget_warning"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "medium"
    }
  ],
  retry_budget_exceeded: [
    {
      kind: "stop_and_request_human_review",
      reduces: ["autonomy_budget"],
      driversAddressed: ["retry_budget_exceeded"],
      requiredEvidence: [],
      rationale: "retry_budget_human_review_rationale",
      priority: "critical"
    }
  ],
  repeated_defer_detected: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["repeated_defer_detected"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["repeated_defer_detected"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "high"
    }
  ],
  repeated_defer_limit_reached: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["repeated_defer_limit_reached"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["repeated_defer_limit_reached"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "high"
    },
    {
      kind: "stop_and_request_human_review",
      reduces: ["autonomy_budget"],
      driversAddressed: ["repeated_defer_limit_reached"],
      requiredEvidence: [],
      rationale: "autonomy_budget_human_review_rationale",
      priority: "critical"
    }
  ],
  no_net_progress_detected: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["no_net_progress_detected"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["no_net_progress_detected"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "high"
    },
    {
      kind: "stop_and_request_human_review",
      reduces: ["autonomy_budget"],
      driversAddressed: ["no_net_progress_detected"],
      requiredEvidence: [],
      rationale: "autonomy_budget_human_review_rationale",
      priority: "critical"
    }
  ],
  no_progress_evidence_missing: [
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["no_progress_evidence_missing"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "medium"
    }
  ],
  action_scope_too_broad: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["action_scope_too_broad"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    }
  ],
  diff_churn_unknown: [
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["diff_churn_unknown"],
      requiredEvidence: ["diff_churn_classified"],
      rationale: "inspect_progress_state_rationale",
      priority: "medium"
    }
  ],
  diff_churn_high: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["diff_churn_high"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "inspect_progress_state",
      reduces: ["autonomy_budget"],
      driversAddressed: ["diff_churn_high"],
      requiredEvidence: ["progress_state_available"],
      rationale: "inspect_progress_state_rationale",
      priority: "medium"
    }
  ],
  context_budget_unknown: [
    {
      kind: "refresh_context",
      reduces: ["context", "autonomy_budget"],
      driversAddressed: ["context_budget_unknown"],
      requiredEvidence: ["context_budget_available"],
      rationale: "refresh_context_rationale",
      priority: "medium"
    }
  ],
  context_budget_warning: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["context_budget_warning"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "refresh_context",
      reduces: ["context", "autonomy_budget"],
      driversAddressed: ["context_budget_warning"],
      requiredEvidence: ["context_budget_available"],
      rationale: "refresh_context_rationale",
      priority: "medium"
    }
  ],
  context_budget_exceeded: [
    {
      kind: "narrow_action_scope",
      reduces: ["autonomy_budget", "context"],
      driversAddressed: ["context_budget_exceeded"],
      requiredEvidence: ["action_scope_classified"],
      rationale: "narrow_action_scope_rationale",
      priority: "high"
    },
    {
      kind: "stop_and_request_human_review",
      reduces: ["autonomy_budget"],
      driversAddressed: ["context_budget_exceeded"],
      requiredEvidence: [],
      rationale: "autonomy_budget_human_review_rationale",
      priority: "critical"
    }
  ],
  provenance_unknown: [
    {
      kind: "inspect_provenance",
      reduces: ["provenance"],
      driversAddressed: ["provenance_unknown"],
      requiredEvidence: ["provenance_classified"],
      rationale: "inspect_provenance_rationale",
      priority: "medium"
    }
  ],
  delegated_action_provenance_unknown: [
    {
      kind: "inspect_provenance",
      reduces: ["provenance"],
      driversAddressed: ["delegated_action_provenance_unknown"],
      requiredEvidence: ["provenance_classified"],
      rationale: "inspect_provenance_rationale",
      priority: "medium"
    }
  ],
  provenance_untrusted: [
    {
      kind: "inspect_provenance",
      reduces: ["provenance"],
      driversAddressed: ["provenance_untrusted"],
      requiredEvidence: ["provenance_classified"],
      rationale: "inspect_provenance_rationale",
      priority: "high"
    }
  ]
};

const priorityRank: Record<UncertaintyReductionPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

const stepKindOrder = new Map<UncertaintyReductionStepKind, number>(
  [
    "stop_and_request_human_review",
    "read_target_file",
    "refresh_target_file",
    "read_related_tests",
    "inspect_related_context",
    "run_validation",
    "inspect_validation_config",
    "inspect_validation_failure",
    "fix_validation_failure_before_retry",
    "inspect_package_script",
    "classify_command",
    "inspect_environment",
    "confirm_deploy_target",
    "inspect_git_state",
    "inspect_branch_policy",
    "inspect_workspace_boundary",
    "inspect_recovery_state",
    "create_checkpoint",
    "narrow_action_scope",
    "refresh_context",
    "inspect_progress_state",
    "limit_retry_scope",
    "inspect_provenance"
  ].map((kind, index) => [kind as UncertaintyReductionStepKind, index])
);

const dimensionOrder = new Map<UncertaintyDimension, number>(
  uncertaintyDimensions.map((dimension, index) => [dimension, index])
);

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const orderDimensions = (
  dimensions: UncertaintyDimension[]
): UncertaintyDimension[] =>
  unique(dimensions).sort(
    (left, right) =>
      (dimensionOrder.get(left) ?? 0) - (dimensionOrder.get(right) ?? 0)
  );

const orderCategoryIds = (values: string[]): string[] => unique(values).sort();

const strongerPriority = (
  current: UncertaintyReductionPriority,
  next: UncertaintyReductionPriority
): UncertaintyReductionPriority =>
  priorityRank[next] > priorityRank[current] ? next : current;

const collectDrivers = (dimensions: UncertaintyDimensionsRecord): string[] =>
  uncertaintyDimensions.flatMap((dimension) => dimensions[dimension].drivers);

const secretDriverIds = new Set([
  "secret_path_detected",
  "secret_pattern_detected",
  "secret_material_detected"
]);

const secretUnsafeOrdinaryDriverIds = new Set([
  "target_file_not_observed",
  "target_file_freshness_unknown",
  "target_file_stale",
  "target_file_hash_changed",
  "related_tests_not_observed",
  "context_completeness_low",
  "context_completeness_medium",
  "sensitive_path_detected",
  "sensitive_surface_detected",
  "sensitive_context_missing",
  "sensitive_surface_context_incomplete"
]);

const sensitiveReviewOrdinaryDriverIds = new Set([
  "sensitive_path_detected",
  "sensitive_surface_detected"
]);

const normalizeDriversForPlan = (drivers: string[]): string[] => {
  const hasSecretDriver = drivers.some((driver) => secretDriverIds.has(driver));
  const hasSensitiveReviewDriver = drivers.includes(
    "sensitive_change_review_required"
  );
  const hasSensitiveReducibleDriver = drivers.some(
    (driver) =>
      driver === "sensitive_context_missing" ||
      driver === "sensitive_surface_context_incomplete" ||
      driver === "sensitive_validation_missing"
  );

  return drivers.filter((driver) => {
    if (hasSecretDriver && secretUnsafeOrdinaryDriverIds.has(driver)) {
      return false;
    }

    if (
      hasSensitiveReviewDriver &&
      !hasSensitiveReducibleDriver &&
      sensitiveReviewOrdinaryDriverIds.has(driver)
    ) {
      return false;
    }

    return true;
  });
};

const specToStep = (spec: StepSpec): UncertaintyReductionStep => ({
  id: `step_${spec.kind}`,
  kind: spec.kind,
  reduces: orderDimensions(spec.reduces),
  driversAddressed: orderCategoryIds(spec.driversAddressed),
  requiredEvidence: orderCategoryIds(spec.requiredEvidence),
  rationale: spec.rationale,
  priority: spec.priority
});

const mergeStep = (
  current: UncertaintyReductionStep,
  next: UncertaintyReductionStep
): UncertaintyReductionStep => ({
  ...current,
  reduces: orderDimensions([...current.reduces, ...next.reduces]),
  driversAddressed: orderCategoryIds([
    ...current.driversAddressed,
    ...next.driversAddressed
  ]),
  requiredEvidence: orderCategoryIds([
    ...current.requiredEvidence,
    ...next.requiredEvidence
  ]),
  priority: strongerPriority(current.priority, next.priority)
});

const sortSteps = (
  steps: UncertaintyReductionStep[]
): UncertaintyReductionStep[] =>
  [...steps].sort(
    (left, right) =>
      priorityRank[right.priority] - priorityRank[left.priority] ||
      (stepKindOrder.get(left.kind) ?? 999) -
        (stepKindOrder.get(right.kind) ?? 999) ||
      left.id.localeCompare(right.id)
  );

const stepsForDrivers = (drivers: string[]): UncertaintyReductionStep[] => {
  const stepsByKind = new Map<
    UncertaintyReductionStepKind,
    UncertaintyReductionStep
  >();

  for (const driver of drivers) {
    for (const spec of driverStepMap[driver] ?? []) {
      const nextStep = specToStep(spec);
      const currentStep = stepsByKind.get(nextStep.kind);

      stepsByKind.set(
        nextStep.kind,
        currentStep === undefined ? nextStep : mergeStep(currentStep, nextStep)
      );
    }
  }

  return sortSteps(Array.from(stepsByKind.values()));
};

const hasHumanReviewStep = (steps: UncertaintyReductionStep[]): boolean =>
  steps.some((step) => step.kind === "stop_and_request_human_review");

const hasOnlyAutonomyStop = (steps: UncertaintyReductionStep[]): boolean =>
  steps.length > 0 &&
  steps.every(
    (step) =>
      step.kind === "stop_and_request_human_review" &&
      step.reduces.length === 1 &&
      step.reduces[0] === "autonomy_budget"
  );

export const expectedNextDecisionForReductionPlan = (
  steps: UncertaintyReductionStep[]
): UncertaintyReductionExpectedNextDecision => {
  if (steps.length === 0) {
    return "UNKNOWN";
  }

  if (hasOnlyAutonomyStop(steps)) {
    return "UNKNOWN";
  }

  if (hasHumanReviewStep(steps)) {
    return "ESCALATE";
  }

  return "PROCEED_OR_ESCALATE";
};

export const buildUncertaintyReductionPlan = (
  dimensions: UncertaintyDimensionsRecord
): UncertaintyReductionPlan | undefined => {
  const drivers = normalizeDriversForPlan(collectDrivers(dimensions));
  const steps = stepsForDrivers(drivers);

  if (steps.length === 0) {
    return undefined;
  }

  return uncertaintyReductionPlanSchema.parse({
    schemaVersion: uncertaintyReductionPlanSchemaVersion,
    summary: "uncertainty_reduction_plan_available",
    steps,
    expectedNextDecision: expectedNextDecisionForReductionPlan(steps)
  });
};
