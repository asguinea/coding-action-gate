export const datasetFamilies = [
  "hallucination_grounding",
  "abstention_unanswerable",
  "ambiguity_disambiguation",
  "truthfulness_misconception",
  "agent_process_tool_use",
  "medical_label_uncertainty",
  "distribution_shift_robustness",
  "citation_reference_integrity",
  "benchmark_label_quality"
] as const;

export const domainKnowledgeAreas = [
  "cross_domain_rag",
  "news_summarization",
  "open_domain_web_qa",
  "structured_business_data",
  "reading_comprehension",
  "general_world_knowledge",
  "health_law_finance_politics_misconceptions",
  "biographical_long_form_generation",
  "math_reasoning_world_knowledge",
  "tool_using_agents",
  "multi_agent_workflows",
  "agent_benchmark_environments",
  "medical_imaging_chest_radiology",
  "real_world_distribution_shift",
  "weather_prediction",
  "machine_translation",
  "autonomous_driving_motion_prediction",
  "scientific_citations",
  "benchmark_label_validation"
] as const;

export const nativeLabelTypes = [
  "correct_incorrect",
  "answerable_unanswerable",
  "supported_unsupported",
  "hallucinated_non_hallucinated",
  "segment_or_word_level_hallucination",
  "hallucination_intensity",
  "segment_factuality",
  "atomic_fact_support",
  "ambiguous_unambiguous",
  "multiple_valid_answers",
  "disambiguated_rewrites",
  "uncertain_positive_negative",
  "in_distribution_out_of_distribution",
  "shifted_evaluation_split",
  "step_quality_label",
  "failure_category",
  "root_cause_failure_step",
  "tool_error_pattern",
  "label_error_validated"
] as const;

export const normalizedUncertaintyTypes = [
  "missing_evidence",
  "evidence_mismatch",
  "evidence_contradiction",
  "ambiguous_intent",
  "model_confabulation",
  "misconception_imitation",
  "process_uncertainty",
  "tool_action_uncertainty",
  "root_cause_uncertainty",
  "expert_disagreement",
  "label_uncertainty",
  "high_stakes_uncertainty",
  "distribution_shift",
  "out_of_distribution_input",
  "benchmark_ground_truth_uncertainty"
] as const;

export const normalizedMistakeTypes = [
  "confident_wrong_answer",
  "unsupported_claim",
  "contradicted_claim",
  "failure_to_abstain",
  "ambiguous_answer_without_clarification",
  "wrong_tool_or_action",
  "premature_tool_or_action",
  "failed_agent_step",
  "root_cause_process_failure",
  "overconfident_under_shift",
  "uncertain_high_stakes_prediction",
  "benchmark_label_error"
] as const;

export const controlDecisionsSupported = [
  "PROCEED",
  "DEFER_FOR_EVIDENCE",
  "DEFER_FOR_CLARIFICATION",
  "ESCALATE_TO_HUMAN",
  "BLOCK_UNSUPPORTED",
  "BLOCK_CONTRADICTED",
  "BLOCK_UNSAFE_ACTION",
  "MONITOR_SHIFT",
  "REVIEW_LABEL"
] as const;

export const strategicUses = [
  "investor_evidence",
  "client_evidence",
  "technical_taxonomy",
  "simulator_candidate",
  "calibration_candidate",
  "benchmark_methodology",
  "high_stakes_story",
  "agentic_product_story"
] as const;

export const priorities = [
  "very_high",
  "high",
  "medium_high",
  "medium",
  "low"
] as const;

export type DatasetFamily = (typeof datasetFamilies)[number];
export type DomainKnowledgeArea = (typeof domainKnowledgeAreas)[number];
export type NativeLabelType = (typeof nativeLabelTypes)[number];
export type NormalizedUncertaintyType =
  (typeof normalizedUncertaintyTypes)[number];
export type NormalizedMistakeType = (typeof normalizedMistakeTypes)[number];
export type ControlDecisionSupported =
  (typeof controlDecisionsSupported)[number];
export type StrategicUse = (typeof strategicUses)[number];
export type Priority = (typeof priorities)[number];

export interface PublicEvidenceMapEntry {
  dataset_id: string;
  dataset_name: string;
  dataset_family: DatasetFamily;
  domain_knowledge_area: DomainKnowledgeArea[];
  native_label_type: NativeLabelType[];
  normalized_uncertainty_type: NormalizedUncertaintyType[];
  normalized_mistake_type: NormalizedMistakeType[];
  control_decision_supported: ControlDecisionSupported[];
  strategic_use: StrategicUse[];
  priority: Priority;
  main_limitation: string;
  recommended_use: string;
  source_url: string;
  source_note: string;
}

export interface PublicEvidenceMapControlledVocabulary {
  dataset_family: readonly DatasetFamily[];
  domain_knowledge_area: readonly DomainKnowledgeArea[];
  native_label_type: readonly NativeLabelType[];
  normalized_uncertainty_type: readonly NormalizedUncertaintyType[];
  normalized_mistake_type: readonly NormalizedMistakeType[];
  control_decision_supported: readonly ControlDecisionSupported[];
  strategic_use: readonly StrategicUse[];
  priority: readonly Priority[];
}

export interface PublicEvidenceMapSummary {
  totalDatasetCount: number;
  countsByDatasetFamily: Record<string, number>;
  countsByPriority: Record<string, number>;
  countsByControlDecisionSupported: Record<string, number>;
  veryHighPriorityDatasets: Array<{
    dataset_id: string;
    dataset_name: string;
  }>;
  simulatorShortlistCandidates: Array<{
    dataset_id: string;
    dataset_name: string;
  }>;
}
