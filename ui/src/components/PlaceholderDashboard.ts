import type {
  PlaceholderDashboardData,
  UiAuditTimelineFilters,
  UiCountSummary,
  UiGitStateSummary
} from "../api/types.js";
import { filterAuditRecords } from "../api/auditTimelineFormatters.js";
import { summarizeAction } from "../api/decisionFormatters.js";
import { createAuditTimeline } from "./AuditTimeline.js";
import { createDecisionPanel } from "./DecisionPanel.js";
import { createDeferView, createNoDeferView } from "./DeferView.js";
import {
  createEscalationView,
  createNoEscalationView
} from "./EscalationView.js";
import { createGitStatusPanel } from "./GitStatusPanel.js";
import { createLandingRiskPanel } from "./LandingRiskPanel.js";
import { createLiveEmptyState } from "./LiveEmptyState.js";
import { createPolicyViewer } from "./PolicyViewer.js";
import { createValidationStatusPanel } from "./ValidationStatusPanel.js";

const createCard = (title: string, body: HTMLElement): HTMLElement => {
  const card = document.createElement("section");
  card.className = "dashboard-card";

  const heading = document.createElement("h2");
  heading.textContent = title;

  card.append(heading, body);

  return card;
};

const createText = (className: string, value: string): HTMLParagraphElement => {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = value;

  return element;
};

const createDashboardSection = (
  title: string,
  subtitle: string,
  content: HTMLElement
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "dashboard-section";

  const header = document.createElement("header");
  header.className = "section-header";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const detail = document.createElement("p");
  detail.textContent = subtitle;

  header.append(heading, detail);
  section.append(header, content);

  return section;
};

const createMockDataNotice = (
  source: PlaceholderDashboardData["source"]
): HTMLElement => {
  const notice = document.createElement("aside");
  notice.className = "mock-data-notice";
  notice.textContent =
    source === "mock"
      ? "Mock Demo mode is active. Switch to Live Local to read from the local read-only UI API server."
      : "Live Local mode is active. Data is loaded from the localhost read-only UI API server.";

  return notice;
};

const countCard = (summary: UiCountSummary): HTMLElement => {
  const body = document.createElement("div");

  body.append(
    createText("metric", String(summary.count)),
    createText("card-primary", summary.label),
    createText("card-secondary", summary.detail)
  );

  return createCard(summary.label, body);
};

const gitCard = (summary: UiGitStateSummary): HTMLElement => {
  const body = document.createElement("div");

  body.append(
    createText(
      "card-primary",
      summary.isGitRepo ? summary.branch : "Not a Git repo"
    ),
    createText("card-secondary", `State: ${summary.repoIntegrityStatus}`)
  );

  return createCard("Git state", body);
};

export const createPlaceholderDashboard = (
  data: PlaceholderDashboardData,
  onSelectDecision?: (decisionId: string) => void,
  auditFilters: UiAuditTimelineFilters = {},
  onAuditFilterChange?: (filters: UiAuditTimelineFilters) => void
): HTMLElement => {
  const root = document.createElement("div");
  root.className = "dashboard-stack";

  const selectedRecord =
    data.auditRecords.find(
      (record) => record.decisionId === data.selectedDecisionId
    ) ?? data.auditRecords[0];

  if (data.auditRecords.length > 0) {
    const selector = document.createElement("div");
    selector.className = "decision-selector";

    for (const record of data.auditRecords) {
      const actionSummary = summarizeAction(record);
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        record.decisionId === selectedRecord?.decisionId
          ? "selector-button selector-button-active"
          : "selector-button";
      button.textContent = `${record.decision}: ${actionSummary.label}`;
      button.addEventListener("click", () =>
        onSelectDecision?.(record.decisionId)
      );
      selector.append(button);
    }

    root.append(
      createDashboardSection(
        data.source === "mock" ? "Demo Flow" : "Loaded Decisions",
        data.source === "mock"
          ? "Select a mock audit record to inspect each Phase 5 UI state."
          : "Select a live audit record returned by the local read-only API.",
        selector
      )
    );
  }

  if (selectedRecord !== undefined) {
    root.append(
      createDashboardSection(
        "Current Decision",
        "Latest selected CodingActionGate authorization result.",
        createDecisionPanel(selectedRecord)
      )
    );

    const repairReview = document.createElement("div");
    repairReview.className = "repair-review-grid";
    repairReview.append(
      selectedRecord.decision === "DEFER"
        ? createDeferView(selectedRecord, {
            deferredActions: data.deferredActionItems ?? [],
            observations: data.observationItems ?? []
          })
        : createNoDeferView(),
      selectedRecord.decision === "ESCALATE"
        ? createEscalationView(selectedRecord)
        : createNoEscalationView()
    );
    root.append(
      createDashboardSection(
        "Repair / Review",
        "DEFER repair steps and escalation review context for the selected decision.",
        repairReview
      )
    );

    const statusPanels = document.createElement("div");
    statusPanels.className = "status-panel-grid";
    statusPanels.append(
      createGitStatusPanel(selectedRecord, data.liveGitState),
      createValidationStatusPanel(selectedRecord, data.validationRecordItems),
      createLandingRiskPanel(selectedRecord)
    );
    root.append(
      createDashboardSection(
        "Runtime Signals",
        "Git workflow, validation evidence, and landing-risk signals.",
        statusPanels
      )
    );
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No latest decision available.";
    root.append(
      createDashboardSection(
        "Current Decision",
        "Latest selected CodingActionGate authorization result.",
        data.source === "live"
          ? createLiveEmptyState("audit", {
              defaultPolicy: data.policySource?.type === "default"
            })
          : empty
      )
    );
  }

  const grid = document.createElement("div");
  grid.className = "dashboard-grid";

  grid.append(
    countCard(data.deferredActions),
    countCard(data.validationRecords),
    gitCard(data.gitState),
    countCard(data.observations),
    countCard(data.auditTimeline)
  );

  root.append(
    createDashboardSection(
      "Runtime Stores",
      "Read-only summaries of the local CodingActionGate runtime stores.",
      grid
    )
  );

  root.append(
    createDashboardSection(
      "Policy",
      "Read-only policy source, validation requirements, thresholds, and rules.",
      createPolicyViewer(data.policy, data.policySource)
    )
  );

  if (data.source === "live") {
    const liveHints = document.createElement("div");
    liveHints.className = "live-hint-grid";

    if (data.deferredActions.count === 0) {
      liveHints.append(createLiveEmptyState("deferred"));
    }

    if (data.validationRecords.count === 0) {
      liveHints.append(createLiveEmptyState("validation"));
    }

    if (data.observations.count === 0) {
      liveHints.append(createLiveEmptyState("observations"));
    }

    if (liveHints.childElementCount > 0) {
      root.append(
        createDashboardSection(
          "First-Run Guidance",
          "Suggested read-only CLI steps for populating local CodingActionGate runtime data.",
          liveHints
        )
      );
    }
  }

  if (
    selectedRecord !== undefined &&
    filterAuditRecords(data.auditRecords, auditFilters).every(
      (record) => record.decisionId !== selectedRecord.decisionId
    )
  ) {
    const hidden = document.createElement("p");
    hidden.className = "empty-state";
    hidden.textContent =
      "Current timeline filters hide the selected decision, but the Decision Panel remains visible.";
    root.append(hidden);
  }

  root.append(
    createDashboardSection(
      "Audit Timeline",
      "Filter and inspect chronological CodingActionGate decisions.",
      createAuditTimeline(
        data.auditRecords,
        data.selectedDecisionId,
        auditFilters,
        (filters) => onAuditFilterChange?.(filters),
        onSelectDecision
      )
    )
  );
  root.append(createMockDataNotice(data.source));

  return root;
};
