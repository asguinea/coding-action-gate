# Evidence Thesis and Selection Criteria

CodingActionGate is one instantiation of the broader uncertainty-aware control-plane thesis; this folder does not modify CodingActionGate runtime behavior.

Reliable AI requires an uncertainty-aware control plane.

The control plane converts uncertainty signals into explicit operational decisions: PROCEED, DEFER, ESCALATE, or BLOCK.

The point of U1 is not to prove the full thesis yet. It is to identify public datasets that can support pieces of the thesis.

U1.1 and U1.2 catalogue public evidence sources only; they do not prove the thesis, implement a simulator, or validate a production system.

Public labeled datasets across QA, RAG, ambiguity, agent/tool use, medicine, distribution shift, and benchmark-label quality show recurring AI failure modes where the right behavior is not simply "answer better," but to defer, gather evidence, escalate, block, monitor shift, or review labels.

Many AI mistakes occur in situations where uncertainty should be explicitly managed, but this evidence map does not claim uncertainty explains every AI mistake.

## Useful Public Evidence

A dataset or study is relevant if it contains at least one of these:

1. Labeled AI mistakes, such as hallucinated, unsupported, incorrect, failed step, or wrong tool use.
2. Labeled situations where AI should abstain or defer, such as unanswerable questions, missing evidence, or ambiguous queries.
3. Labeled uncertainty in the ground truth, such as uncertain medical findings, expert disagreement, or ambiguous labels.
4. Labeled distribution shift or robustness failure, such as in-distribution versus out-of-distribution performance gaps.
5. Process/action-level failure labels, such as failed agent steps, tool-use errors, or root-cause failure categories.
6. Evidence-quality labels, such as supported versus unsupported claims, citation existence, fabricated citation, or reference support/contradiction.

## Exclusion And Deprioritization

The v0 catalogue excludes or deprioritizes:

- generic accuracy benchmarks with no useful mistake labels
- pure leaderboard datasets with only final score and no failure type
- datasets where labels are inaccessible or entirely private
- datasets with unclear licensing or access
- datasets too narrow to support the broader uncertainty-control thesis
- datasets where the model output or action is not observable

## Controlled Vocabulary

### dataset_family

- `hallucination_grounding`
- `abstention_unanswerable`
- `ambiguity_disambiguation`
- `truthfulness_misconception`
- `agent_process_tool_use`
- `medical_label_uncertainty`
- `distribution_shift_robustness`
- `citation_reference_integrity`
- `benchmark_label_quality`

### domain_knowledge_area

- `cross_domain_rag`
- `news_summarization`
- `open_domain_web_qa`
- `structured_business_data`
- `reading_comprehension`
- `general_world_knowledge`
- `health_law_finance_politics_misconceptions`
- `biographical_long_form_generation`
- `math_reasoning_world_knowledge`
- `tool_using_agents`
- `multi_agent_workflows`
- `agent_benchmark_environments`
- `medical_imaging_chest_radiology`
- `real_world_distribution_shift`
- `weather_prediction`
- `machine_translation`
- `autonomous_driving_motion_prediction`
- `scientific_citations`
- `benchmark_label_validation`

### native_label_type

- `correct_incorrect`
- `answerable_unanswerable`
- `supported_unsupported`
- `hallucinated_non_hallucinated`
- `segment_or_word_level_hallucination`
- `hallucination_intensity`
- `segment_factuality`
- `atomic_fact_support`
- `ambiguous_unambiguous`
- `multiple_valid_answers`
- `disambiguated_rewrites`
- `uncertain_positive_negative`
- `in_distribution_out_of_distribution`
- `shifted_evaluation_split`
- `step_quality_label`
- `failure_category`
- `root_cause_failure_step`
- `tool_error_pattern`
- `label_error_validated`

### normalized_uncertainty_type

- `missing_evidence`
- `evidence_mismatch`
- `evidence_contradiction`
- `ambiguous_intent`
- `model_confabulation`
- `misconception_imitation`
- `process_uncertainty`
- `tool_action_uncertainty`
- `root_cause_uncertainty`
- `expert_disagreement`
- `label_uncertainty`
- `high_stakes_uncertainty`
- `distribution_shift`
- `out_of_distribution_input`
- `benchmark_ground_truth_uncertainty`

### normalized_mistake_type

- `confident_wrong_answer`
- `unsupported_claim`
- `contradicted_claim`
- `failure_to_abstain`
- `ambiguous_answer_without_clarification`
- `wrong_tool_or_action`
- `premature_tool_or_action`
- `failed_agent_step`
- `root_cause_process_failure`
- `overconfident_under_shift`
- `uncertain_high_stakes_prediction`
- `benchmark_label_error`

### control_decision_supported

- `PROCEED`
- `DEFER_FOR_EVIDENCE`
- `DEFER_FOR_CLARIFICATION`
- `ESCALATE_TO_HUMAN`
- `BLOCK_UNSUPPORTED`
- `BLOCK_CONTRADICTED`
- `BLOCK_UNSAFE_ACTION`
- `MONITOR_SHIFT`
- `REVIEW_LABEL`

### strategic_use

- `investor_evidence`
- `client_evidence`
- `technical_taxonomy`
- `simulator_candidate`
- `calibration_candidate`
- `benchmark_methodology`
- `high_stakes_story`
- `agentic_product_story`

### priority

- `very_high`
- `high`
- `medium_high`
- `medium`
- `low`

## Claim Boundaries

This evidence map is a source-grounded inventory for later research planning. It does not validate the control-plane thesis, validate CodingActionGate, prove production reliability, provide statistical assurances, provide conformal or CRC assurances, establish deployment evidence, replace pilots, or claim uncertainty causes every AI mistake.
