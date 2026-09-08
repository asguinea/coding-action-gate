import {
  summarizeProtectedBranches,
  summarizeSensitivePaths,
  summarizeThresholds,
  summarizeValidationPolicy
} from "../api/policyFormatters.js";
import type { UiPolicy, UiPolicySource } from "../api/types.js";
import { createPolicyRuleList } from "./PolicyRuleList.js";
import { createPolicySourceBadge } from "./PolicySourceBadge.js";
import { createPolicySummaryCard } from "./PolicySummaryCard.js";

const thresholdItems = (policy: UiPolicy | undefined): string[] =>
  summarizeThresholds(policy).map((entry) => `${entry.key}: ${entry.value}`);

const sensitivePathItems = (policy: UiPolicy | undefined): string[] =>
  summarizeSensitivePaths(policy).map(
    (entry) => `${entry.level}: ${entry.patterns.join(", ")}`
  );

export const createPolicyViewer = (
  policy: UiPolicy | undefined,
  source: UiPolicySource | undefined
): HTMLElement => {
  const viewer = document.createElement("section");
  viewer.className = "policy-viewer";

  const header = document.createElement("header");
  header.className = "policy-viewer-header";

  const title = document.createElement("h2");
  title.textContent = "Policy Viewer";

  header.append(title, createPolicySourceBadge(source));
  viewer.append(header);

  if (policy === undefined) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No policy information available.";
    viewer.append(empty);

    return viewer;
  }

  const grid = document.createElement("div");
  grid.className = "policy-summary-grid";
  grid.append(
    createPolicySummaryCard(
      "Protected branches",
      summarizeProtectedBranches(policy)
    ),
    createPolicySummaryCard("Sensitive paths", sensitivePathItems(policy)),
    createPolicySummaryCard("Validation", summarizeValidationPolicy(policy)),
    createPolicySummaryCard("Thresholds", thresholdItems(policy))
  );

  viewer.append(grid, createPolicyRuleList(policy));

  return viewer;
};
