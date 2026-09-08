import {
  computeResearchArtifactPackageMetrics,
  validateArtifactAssetGraph,
  validateResearchArtifactPackage,
  validateResearchArtifactPackageSafety,
  validateResearchArtifactPackages,
  validateTraceLinkageExamples,
  type ResearchArtifactPackage,
  type ResearchArtifactPackageMetrics
} from "./artifactPackageSchema.js";

export const loadExampleResearchArtifactPackages = (
  rawPackages: unknown[]
): ResearchArtifactPackage[] =>
  validateResearchArtifactPackages(rawPackages).map((artifactPackage) => {
    validateArtifactAssetGraph(artifactPackage);
    validateTraceLinkageExamples(artifactPackage);
    validateResearchArtifactPackageSafety(artifactPackage);

    return artifactPackage;
  });

export const summarizeResearchArtifactPackage = (
  artifactPackage: ResearchArtifactPackage
): {
  artifactPackageId: string;
  source: ResearchArtifactPackage["source"];
  assetCount: number;
  directTraceLinkageExampleCount: number;
  syntheticOnly: true;
} => ({
  artifactPackageId: artifactPackage.artifactPackageId,
  source: artifactPackage.source,
  assetCount: Object.keys(artifactPackage.includedAssets).length,
  directTraceLinkageExampleCount: artifactPackage.traceLinkageExamples.filter(
    (linkage) => linkage.directTraceReviewLink
  ).length,
  syntheticOnly: true
});

export {
  computeResearchArtifactPackageMetrics,
  validateArtifactAssetGraph,
  validateResearchArtifactPackage,
  validateResearchArtifactPackageSafety,
  validateResearchArtifactPackages,
  validateTraceLinkageExamples
};

export type { ResearchArtifactPackage, ResearchArtifactPackageMetrics };
