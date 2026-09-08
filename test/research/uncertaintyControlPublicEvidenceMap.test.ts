import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPublicEvidenceMapControlledVocabulary,
  getSimulatorShortlist,
  loadPublicEvidenceMap,
  summarizePublicEvidenceMap,
  validatePublicEvidenceMap,
  type PublicEvidenceMapEntry
} from "../../research/uncertainty-control-public-evidence/index.js";

const researchRoot = path.join(
  process.cwd(),
  "research",
  "uncertainty-control-public-evidence"
);

const requiredDatasetIds = Array.from(
  { length: 15 },
  (_, index) => `U1-D${String(index + 1).padStart(3, "0")}`
);

const requiredShortlistIds = [
  "U1-D001",
  "U1-D002",
  "U1-D003",
  "U1-D011",
  "U1-D008",
  "U1-D009"
] as const;

const requiredFields = [
  "dataset_id",
  "dataset_name",
  "dataset_family",
  "domain_knowledge_area",
  "native_label_type",
  "normalized_uncertainty_type",
  "normalized_mistake_type",
  "control_decision_supported",
  "strategic_use",
  "priority",
  "main_limitation",
  "recommended_use",
  "source_url",
  "source_note"
] as const;

const forbiddenOverclaims = [
  "control plane has been validated",
  "CodingActionGate has been validated",
  "production reliability is proven",
  "statistical guarantees exist",
  "conformal guarantee",
  "CRC guarantee",
  "real-world deployment evidence exists",
  "public datasets replace pilots",
  "all AI mistakes are caused by uncertainty"
] as const;

const findDataset = (
  entries: PublicEvidenceMapEntry[],
  datasetId: string
): PublicEvidenceMapEntry => {
  const entry = entries.find((candidate) => candidate.dataset_id === datasetId);

  if (!entry) {
    throw new Error(`Missing test fixture dataset ${datasetId}`);
  }

  return entry;
};

const mutableClone = (
  entries: PublicEvidenceMapEntry[]
): Array<Record<string, unknown>> =>
  structuredClone(entries) as unknown as Array<Record<string, unknown>>;

describe("uncertainty-control public evidence map", () => {
  it("keeps the public evidence package files in the isolated research folder", async () => {
    const expectedFiles = [
      "README.md",
      "docs/selection-criteria.md",
      "docs/public-evidence-map-v0.md",
      "data/public-evidence-map.v0.json",
      "schema/publicEvidenceMapSchema.ts",
      "publicEvidenceMap.ts",
      "index.ts"
    ];

    for (const file of expectedFiles) {
      await expect(access(path.join(researchRoot, file))).resolves.toBeUndefined();
    }
  });

  it("exports the full controlled vocabulary", () => {
    const vocabulary = getPublicEvidenceMapControlledVocabulary();

    expect(vocabulary.dataset_family).toEqual(
      expect.arrayContaining([
        "hallucination_grounding",
        "abstention_unanswerable",
        "ambiguity_disambiguation",
        "truthfulness_misconception",
        "agent_process_tool_use",
        "medical_label_uncertainty",
        "distribution_shift_robustness",
        "citation_reference_integrity",
        "benchmark_label_quality"
      ])
    );
    expect(vocabulary.control_decision_supported).toEqual(
      expect.arrayContaining([
        "PROCEED",
        "DEFER_FOR_EVIDENCE",
        "DEFER_FOR_CLARIFICATION",
        "ESCALATE_TO_HUMAN",
        "BLOCK_UNSUPPORTED",
        "BLOCK_CONTRADICTED",
        "BLOCK_UNSAFE_ACTION",
        "MONITOR_SHIFT",
        "REVIEW_LABEL"
      ])
    );
    expect(vocabulary.priority).toEqual(
      expect.arrayContaining([
        "very_high",
        "high",
        "medium_high",
        "medium",
        "low"
      ])
    );
  });

  it("loads exactly U1-D001 through U1-D015 with required fields and valid shape", () => {
    const entries = loadPublicEvidenceMap();
    const ids = entries.map((entry) => entry.dataset_id);

    expect(entries).toHaveLength(15);
    expect(ids).toEqual(requiredDatasetIds);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of entries) {
      for (const field of requiredFields) {
        expect(entry[field]).toBeDefined();
      }

      expect(entry.dataset_id).toMatch(/^U1-D\d{3}$/);
      expect(entry.domain_knowledge_area.length).toBeGreaterThan(0);
      expect(entry.native_label_type.length).toBeGreaterThan(0);
      expect(entry.normalized_uncertainty_type.length).toBeGreaterThan(0);
      expect(entry.normalized_mistake_type.length).toBeGreaterThan(0);
      expect(entry.control_decision_supported.length).toBeGreaterThan(0);
      expect(entry.strategic_use.length).toBeGreaterThan(0);
      expect(entry.main_limitation.trim()).not.toBe("");
      expect(entry.recommended_use.trim()).not.toBe("");
      expect(entry.source_url.trim()).not.toBe("");
      expect(entry.source_note.trim()).not.toBe("");
    }
  });

  it("preserves the dataset-specific precision needed for v0 evidence planning", () => {
    const entries = loadPublicEvidenceMap();

    const ragTruth = findDataset(entries, "U1-D001");
    expect(ragTruth.domain_knowledge_area).toEqual(
      expect.arrayContaining([
        "news_summarization",
        "open_domain_web_qa",
        "structured_business_data"
      ])
    );
    expect(ragTruth.normalized_uncertainty_type).toEqual(
      expect.arrayContaining(["evidence_mismatch", "evidence_contradiction"])
    );

    const squad = findDataset(entries, "U1-D002");
    expect(squad.normalized_uncertainty_type).toContain("missing_evidence");
    expect(squad.control_decision_supported).toContain("DEFER_FOR_EVIDENCE");

    const ambigQa = findDataset(entries, "U1-D003");
    expect(ambigQa.normalized_uncertainty_type).toContain("ambiguous_intent");
    expect(ambigQa.control_decision_supported).toContain(
      "DEFER_FOR_CLARIFICATION"
    );

    const cheXpert = findDataset(entries, "U1-D008");
    expect(cheXpert.normalized_uncertainty_type).toEqual(
      expect.arrayContaining([
        "expert_disagreement",
        "label_uncertainty",
        "high_stakes_uncertainty"
      ])
    );
    expect(cheXpert.control_decision_supported).toContain("ESCALATE_TO_HUMAN");

    const wilds = findDataset(entries, "U1-D009");
    expect(wilds.normalized_uncertainty_type).toContain("distribution_shift");
    expect(wilds.control_decision_supported).toContain("MONITOR_SHIFT");

    const agentProcessBench = findDataset(entries, "U1-D011");
    expect(agentProcessBench.normalized_uncertainty_type).toEqual(
      expect.arrayContaining(["process_uncertainty", "tool_action_uncertainty"])
    );

    const labelErrors = findDataset(entries, "U1-D015");
    expect(labelErrors.normalized_uncertainty_type).toContain(
      "benchmark_ground_truth_uncertainty"
    );
    expect(labelErrors.control_decision_supported).toContain("REVIEW_LABEL");
  });

  it("rejects malformed catalogues and overclaiming catalogue text", () => {
    const entries = loadPublicEvidenceMap();
    expect(validatePublicEvidenceMap(entries)).toHaveLength(15);

    const missingField = mutableClone(entries);
    const missingFieldEntry = missingField[0];
    if (!missingFieldEntry) {
      throw new Error("Missing mutable clone entry");
    }
    delete missingFieldEntry.dataset_name;
    expect(() => validatePublicEvidenceMap(missingField)).toThrow(
      /missing required field/
    );

    const unknownVocabulary = mutableClone(entries);
    const unknownVocabularyEntry = unknownVocabulary[0];
    if (!unknownVocabularyEntry) {
      throw new Error("Missing mutable clone entry");
    }
    unknownVocabularyEntry.dataset_family = "unknown_family";
    expect(() => validatePublicEvidenceMap(unknownVocabulary)).toThrow(
      /unknown dataset_family/
    );

    const duplicateIds = mutableClone(entries);
    const duplicateSource = duplicateIds[0];
    const duplicateTarget = duplicateIds[1];
    if (!duplicateSource || !duplicateTarget) {
      throw new Error("Missing mutable clone entries");
    }
    duplicateTarget.dataset_id = duplicateSource.dataset_id;
    expect(() => validatePublicEvidenceMap(duplicateIds)).toThrow(/Duplicate/);

    const emptySource = mutableClone(entries);
    const emptySourceEntry = emptySource[0];
    if (!emptySourceEntry) {
      throw new Error("Missing mutable clone entry");
    }
    emptySourceEntry.source_url = "";
    expect(() => validatePublicEvidenceMap(emptySource)).toThrow(/source_url/);

    const emptySourceNote = mutableClone(entries);
    const emptySourceNoteEntry = emptySourceNote[0];
    if (!emptySourceNoteEntry) {
      throw new Error("Missing mutable clone entry");
    }
    emptySourceNoteEntry.source_note = "";
    expect(() => validatePublicEvidenceMap(emptySourceNote)).toThrow(
      /source_note/
    );

    const noControlDecision = mutableClone(entries);
    const noControlDecisionEntry = noControlDecision[0];
    if (!noControlDecisionEntry) {
      throw new Error("Missing mutable clone entry");
    }
    noControlDecisionEntry.control_decision_supported = [];
    expect(() => validatePublicEvidenceMap(noControlDecision)).toThrow(
      /control_decision_supported/
    );

    const overclaim = mutableClone(entries);
    const overclaimEntry = overclaim[0];
    if (!overclaimEntry) {
      throw new Error("Missing mutable clone entry");
    }
    overclaimEntry.source_note =
      "This invalid test fixture says production reliability is proven.";
    expect(() => validatePublicEvidenceMap(overclaim)).toThrow(
      /forbidden overclaim/
    );
  });

  it("summarizes deterministically and returns the required simulator shortlist", () => {
    const entries = loadPublicEvidenceMap();
    const firstSummary = summarizePublicEvidenceMap(entries);
    const secondSummary = summarizePublicEvidenceMap([...entries].reverse());
    const shortlist = getSimulatorShortlist(entries);

    expect(firstSummary).toEqual(secondSummary);
    expect(firstSummary.totalDatasetCount).toBe(15);
    expect(firstSummary.countsByDatasetFamily.hallucination_grounding).toBe(4);
    expect(firstSummary.countsByPriority.very_high).toBe(4);
    expect(firstSummary.countsByControlDecisionSupported.PROCEED).toBe(13);
    expect(firstSummary.veryHighPriorityDatasets.map((entry) => entry.dataset_id))
      .toEqual(["U1-D001", "U1-D002", "U1-D008", "U1-D011"]);
    expect(shortlist.map((entry) => entry.dataset_id)).toEqual(
      requiredShortlistIds
    );
    expect(
      firstSummary.simulatorShortlistCandidates.map((entry) => entry.dataset_id)
    ).toEqual(requiredShortlistIds);
  });

  it("keeps research helpers isolated from runtime decision-engine modules", async () => {
    const helperSources = await Promise.all(
      ["publicEvidenceMap.ts", "index.ts", "schema/publicEvidenceMapSchema.ts"].map(
        (file) => readFile(path.join(researchRoot, file), "utf8")
      )
    );
    const combined = helperSources.join("\n");

    expect(combined).not.toContain("../../src/");
    expect(combined).not.toContain("../src/");
    expect(combined).not.toContain("src/decision");
    expect(combined).not.toContain("decisionEngine");
    expect(combined).not.toContain("loadPolicy");
    expect(combined).not.toContain("runCli");
  });

  it("does not place forbidden overclaims in the machine-readable catalogue", async () => {
    const catalogue = await readFile(
      path.join(researchRoot, "data", "public-evidence-map.v0.json"),
      "utf8"
    );

    for (const phrase of forbiddenOverclaims) {
      expect(catalogue).not.toContain(phrase);
    }
  });
});
