export interface RelatedTestCandidate {
  path: string;
  exists: boolean;
}

export interface RelatedContextDiscovery {
  targetPath: string;
  relatedTestCandidates: RelatedTestCandidate[];
  existingRelatedTests: string[];
}

export interface ContextCompletenessInput {
  relatedTestsFound: boolean;
  relatedTestsRead: boolean;
}

export interface ContextCompletenessResult {
  contextCompletenessScore: number;
  dependencyClosureScore: number;
  relatedContextReason?: string;
}
