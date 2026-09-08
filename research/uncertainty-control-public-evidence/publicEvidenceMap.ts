import publicEvidenceMapV0 from "./data/public-evidence-map.v0.json" with {
  type: "json"
};
import {
  controlDecisionsSupported,
  datasetFamilies,
  domainKnowledgeAreas,
  nativeLabelTypes,
  normalizedMistakeTypes,
  normalizedUncertaintyTypes,
  priorities,
  strategicUses,
  type PublicEvidenceMapControlledVocabulary,
  type PublicEvidenceMapEntry,
  type PublicEvidenceMapSummary
} from "./schema/publicEvidenceMapSchema.js";

const requiredDatasetIds = Array.from(
  { length: 15 },
  (_, index) => `U1-D${String(index + 1).padStart(3, "0")}`
);

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

const forbiddenOverclaimPhrases = [
  ["control plane has been", "validated"],
  ["stepharbor has been", "validated"],
  ["production reliability is", "proven"],
  ["statistical guarantees", "exist"],
  ["conformal", "guarantee"],
  ["crc", "guarantee"],
  ["real-world deployment evidence", "exists"],
  ["public datasets", "replace pilots"],
  ["all ai mistakes are caused by", "uncertainty"],
  ["production", "readiness"]
].map((parts) => parts.join(" ")) as readonly string[];

const simulatorShortlistIds = [
  "U1-D001",
  "U1-D002",
  "U1-D003",
  "U1-D011",
  "U1-D008",
  "U1-D009"
] as const;

const asAllowedSet = (values: readonly string[]): ReadonlySet<string> =>
  new Set(values);

const allowedDatasetFamilies = asAllowedSet(datasetFamilies);
const allowedDomainKnowledgeAreas = asAllowedSet(domainKnowledgeAreas);
const allowedNativeLabelTypes = asAllowedSet(nativeLabelTypes);
const allowedNormalizedUncertaintyTypes = asAllowedSet(
  normalizedUncertaintyTypes
);
const allowedNormalizedMistakeTypes = asAllowedSet(normalizedMistakeTypes);
const allowedControlDecisionsSupported = asAllowedSet(
  controlDecisionsSupported
);
const allowedStrategicUses = asAllowedSet(strategicUses);
const allowedPriorities = asAllowedSet(priorities);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertNonEmptyString = (
  entry: Record<string, unknown>,
  field: string,
  datasetId: string
): void => {
  if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
    throw new Error(`${datasetId} has empty or invalid ${field}`);
  }
};

const assertAllowedString = (
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
  datasetId: string
): void => {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${datasetId} has unknown ${field}: ${String(value)}`);
  }
};

const assertAllowedNonEmptyArray = (
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
  datasetId: string
): void => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${datasetId} has empty or invalid ${field}`);
  }

  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) {
      throw new Error(`${datasetId} has unknown ${field}: ${String(item)}`);
    }
  }
};

const assertNoForbiddenOverclaims = (
  entry: Record<string, unknown>,
  datasetId: string
): void => {
  const haystack = requiredFields
    .map((field) => {
      const value = entry[field];

      return Array.isArray(value) ? value.join(" ") : String(value ?? "");
    })
    .join(" ")
    .toLowerCase();

  for (const phrase of forbiddenOverclaimPhrases) {
    if (haystack.includes(phrase)) {
      throw new Error(`${datasetId} contains forbidden overclaim: ${phrase}`);
    }
  }
};

const countValues = (values: string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;

    return counts;
  }, {});

const sortRecordByKey = (record: Record<string, number>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );

export const getPublicEvidenceMapControlledVocabulary =
  (): PublicEvidenceMapControlledVocabulary => ({
    dataset_family: datasetFamilies,
    domain_knowledge_area: domainKnowledgeAreas,
    native_label_type: nativeLabelTypes,
    normalized_uncertainty_type: normalizedUncertaintyTypes,
    normalized_mistake_type: normalizedMistakeTypes,
    control_decision_supported: controlDecisionsSupported,
    strategic_use: strategicUses,
    priority: priorities
  });

export const validatePublicEvidenceMap = (
  entries: unknown
): PublicEvidenceMapEntry[] => {
  if (!Array.isArray(entries)) {
    throw new Error("Public evidence map must be an array");
  }

  if (entries.length !== requiredDatasetIds.length) {
    throw new Error(
      `Public evidence map must contain exactly ${requiredDatasetIds.length} entries`
    );
  }

  const seenIds = new Set<string>();

  for (const rawEntry of entries) {
    if (!isRecord(rawEntry)) {
      throw new Error("Public evidence map entries must be objects");
    }

    const datasetId =
      typeof rawEntry.dataset_id === "string"
        ? rawEntry.dataset_id
        : "unknown_dataset";

    for (const field of requiredFields) {
      if (!(field in rawEntry)) {
        throw new Error(`${datasetId} is missing required field ${field}`);
      }
    }

    assertNonEmptyString(rawEntry, "dataset_id", datasetId);
    assertNonEmptyString(rawEntry, "dataset_name", datasetId);
    assertNonEmptyString(rawEntry, "main_limitation", datasetId);
    assertNonEmptyString(rawEntry, "recommended_use", datasetId);
    assertNonEmptyString(rawEntry, "source_url", datasetId);
    assertNonEmptyString(rawEntry, "source_note", datasetId);

    if (!/^U1-D\d{3}$/.test(datasetId)) {
      throw new Error(`${datasetId} does not follow U1-D### format`);
    }

    if (seenIds.has(datasetId)) {
      throw new Error(`Duplicate dataset_id: ${datasetId}`);
    }
    seenIds.add(datasetId);

    assertAllowedString(
      rawEntry.dataset_family,
      "dataset_family",
      allowedDatasetFamilies,
      datasetId
    );
    assertAllowedNonEmptyArray(
      rawEntry.domain_knowledge_area,
      "domain_knowledge_area",
      allowedDomainKnowledgeAreas,
      datasetId
    );
    assertAllowedNonEmptyArray(
      rawEntry.native_label_type,
      "native_label_type",
      allowedNativeLabelTypes,
      datasetId
    );
    assertAllowedNonEmptyArray(
      rawEntry.normalized_uncertainty_type,
      "normalized_uncertainty_type",
      allowedNormalizedUncertaintyTypes,
      datasetId
    );
    assertAllowedNonEmptyArray(
      rawEntry.normalized_mistake_type,
      "normalized_mistake_type",
      allowedNormalizedMistakeTypes,
      datasetId
    );
    assertAllowedNonEmptyArray(
      rawEntry.control_decision_supported,
      "control_decision_supported",
      allowedControlDecisionsSupported,
      datasetId
    );
    assertAllowedNonEmptyArray(
      rawEntry.strategic_use,
      "strategic_use",
      allowedStrategicUses,
      datasetId
    );
    assertAllowedString(
      rawEntry.priority,
      "priority",
      allowedPriorities,
      datasetId
    );
    assertNoForbiddenOverclaims(rawEntry, datasetId);
  }

  const actualIds = [...seenIds].sort();

  if (actualIds.join(",") !== requiredDatasetIds.join(",")) {
    throw new Error(
      `Public evidence map must include exactly ${requiredDatasetIds.join(", ")}`
    );
  }

  return entries as PublicEvidenceMapEntry[];
};

export const loadPublicEvidenceMap = (): PublicEvidenceMapEntry[] =>
  validatePublicEvidenceMap(publicEvidenceMapV0);

export const getSimulatorShortlist = (
  entries: PublicEvidenceMapEntry[]
): PublicEvidenceMapEntry[] => {
  const entriesById = new Map(
    entries.map((entry) => [entry.dataset_id, entry] as const)
  );

  return simulatorShortlistIds.map((datasetId) => {
    const entry = entriesById.get(datasetId);

    if (!entry) {
      throw new Error(`Missing simulator shortlist dataset: ${datasetId}`);
    }

    return entry;
  });
};

export const summarizePublicEvidenceMap = (
  entries: PublicEvidenceMapEntry[]
): PublicEvidenceMapSummary => {
  const sortedEntries = [...entries].sort((left, right) =>
    left.dataset_id.localeCompare(right.dataset_id)
  );

  return {
    totalDatasetCount: sortedEntries.length,
    countsByDatasetFamily: sortRecordByKey(
      countValues(sortedEntries.map((entry) => entry.dataset_family))
    ),
    countsByPriority: sortRecordByKey(
      countValues(sortedEntries.map((entry) => entry.priority))
    ),
    countsByControlDecisionSupported: sortRecordByKey(
      countValues(
        sortedEntries.flatMap((entry) => entry.control_decision_supported)
      )
    ),
    veryHighPriorityDatasets: sortedEntries
      .filter((entry) => entry.priority === "very_high")
      .map((entry) => ({
        dataset_id: entry.dataset_id,
        dataset_name: entry.dataset_name
      })),
    simulatorShortlistCandidates: getSimulatorShortlist(sortedEntries).map(
      (entry) => ({
        dataset_id: entry.dataset_id,
        dataset_name: entry.dataset_name
      })
    )
  };
};
