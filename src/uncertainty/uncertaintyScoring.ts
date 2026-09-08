import type {
  ImpactLevel,
  Reducibility,
  UncertaintyDimensionProfile,
  UncertaintyDimensionsRecord,
  UncertaintyLevel
} from "./uncertaintyTypes.js";

const impactRank: Record<ImpactLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

const reducibilityRank: Record<Reducibility, number> = {
  reducible: 0,
  partially_reducible: 1,
  irreducible: 2
};

export const clampScore = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
};

export const scoreToLevel = (score: number): UncertaintyLevel => {
  const clamped = clampScore(score);

  if (clamped >= 0.8) {
    return "critical";
  }

  if (clamped >= 0.5) {
    return "high";
  }

  if (clamped >= 0.25) {
    return "medium";
  }

  return "low";
};

export const maxImpact = (
  left: ImpactLevel,
  right: ImpactLevel
): ImpactLevel => (impactRank[right] > impactRank[left] ? right : left);

const dimensionValues = (
  dimensions: UncertaintyDimensionsRecord | UncertaintyDimensionProfile[]
): UncertaintyDimensionProfile[] =>
  Array.isArray(dimensions) ? dimensions : Object.values(dimensions);

export const combineDimensionScores = (
  dimensions: UncertaintyDimensionsRecord | UncertaintyDimensionProfile[]
): number =>
  clampScore(
    dimensionValues(dimensions).reduce(
      (highest, dimension) => Math.max(highest, dimension.score),
      0
    )
  );

export const deriveOverallLevel = (overallScore: number): UncertaintyLevel =>
  scoreToLevel(overallScore);

export const deriveOverallImpact = (
  dimensions: UncertaintyDimensionsRecord | UncertaintyDimensionProfile[]
): ImpactLevel =>
  dimensionValues(dimensions).reduce<ImpactLevel>(
    (highest, dimension) => maxImpact(highest, dimension.impact),
    "low"
  );

export const deriveOverallReducibility = (
  dimensions: UncertaintyDimensionsRecord | UncertaintyDimensionProfile[]
): Reducibility =>
  dimensionValues(dimensions).reduce<Reducibility>(
    (highest, dimension) =>
      reducibilityRank[dimension.reducibility] > reducibilityRank[highest]
        ? dimension.reducibility
        : highest,
    "reducible"
  );

export const topDriversFromDimensions = (
  dimensions: UncertaintyDimensionsRecord | UncertaintyDimensionProfile[],
  limit = 5
): string[] => {
  const seen = new Set<string>();
  const ranked = dimensionValues(dimensions)
    .flatMap((dimension, dimensionIndex) =>
      dimension.drivers.map((driver, driverIndex) => ({
        driver,
        score: dimension.score,
        dimensionIndex,
        driverIndex
      }))
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.dimensionIndex - right.dimensionIndex ||
        left.driverIndex - right.driverIndex ||
        left.driver.localeCompare(right.driver)
    );

  const topDrivers: string[] = [];

  for (const entry of ranked) {
    if (seen.has(entry.driver)) {
      continue;
    }

    seen.add(entry.driver);
    topDrivers.push(entry.driver);

    if (topDrivers.length >= limit) {
      break;
    }
  }

  return topDrivers;
};
