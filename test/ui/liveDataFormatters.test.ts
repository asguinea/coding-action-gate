import { describe, expect, it } from "vitest";

import {
  buildGitRowsWithFallback,
  buildLiveDataSummary,
  buildLiveEmptyStateHints,
  buildObservationHints,
  chooseInitialSelectedRecord,
  findDeferredActionForRecord,
  includeLatestAuditRecord,
  sortValidationRecordsNewestFirst
} from "../../ui/src/api/liveDataFormatters.js";
import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import type { RuntimeDashboardData } from "../../ui/src/api/runtimeDataTypes.js";
import type {
  UiAuditRecord,
  UiValidationRecord
} from "../../ui/src/api/types.js";

const auditRecord = (
  decisionId: string,
  timestamp: string,
  overrides: Partial<UiAuditRecord> = {}
): UiAuditRecord => ({
  decisionId,
  timestamp,
  action: {
    id: `act_${decisionId}`,
    type: "edit_file",
    targetPath: "README.md"
  },
  decision: "DEFER",
  reason: "Deferred.",
  ...overrides
});

describe("live data formatters", () => {
  it("buildLiveDataSummary counts live records", () => {
    const summary = buildLiveDataSummary({
      source: "live",
      auditRecords: [auditRecord("dec_one", "2026-05-04T00:00:00.000Z")],
      validationRecords: [{ id: "val_one" }],
      deferredActions: [{ id: "def_one" }, { id: "def_two" }],
      observations: [{ id: "obs_one" }],
      gitState: {
        isGitRepo: true,
        currentBranch: "main",
        isDirty: true
      }
    });

    expect(summary).toEqual({
      auditRecords: 1,
      deferredActions: 2,
      observations: 1,
      validationRecords: 1,
      git: "main · dirty"
    });
  });

  it("buildLiveDataSummary summarizes non-git repos", () => {
    expect(
      buildLiveDataSummary({
        source: "live",
        auditRecords: [],
        validationRecords: [],
        gitState: {
          isGitRepo: false
        }
      }).git
    ).toBe("not a git repo");
  });

  it("chooseInitialSelectedRecord prefers latestAuditRecord", () => {
    const latest = auditRecord("dec_latest", "2026-05-04T00:01:00.000Z");
    const data: RuntimeDashboardData = {
      source: "live",
      auditRecords: [auditRecord("dec_old", "2026-05-04T00:00:00.000Z")],
      latestAuditRecord: latest,
      validationRecords: []
    };

    expect(chooseInitialSelectedRecord(data)).toBe(latest);
  });

  it("chooseInitialSelectedRecord falls back to newest audit record", () => {
    expect(
      chooseInitialSelectedRecord({
        source: "live",
        auditRecords: [
          auditRecord("dec_old", "2026-05-04T00:00:00.000Z"),
          auditRecord("dec_new", "2026-05-04T00:02:00.000Z")
        ],
        validationRecords: []
      })?.decisionId
    ).toBe("dec_new");
  });

  it("chooseInitialSelectedRecord handles no records", () => {
    expect(
      chooseInitialSelectedRecord({
        source: "live",
        auditRecords: [],
        validationRecords: []
      })
    ).toBeNull();
  });

  it("includeLatestAuditRecord prepends latest when it is absent", () => {
    const latest = auditRecord("dec_latest", "2026-05-04T00:01:00.000Z");

    expect(
      includeLatestAuditRecord(
        [auditRecord("dec_old", "2026-05-04T00:00:00.000Z")],
        latest
      ).map((record) => record.decisionId)
    ).toEqual(["dec_latest", "dec_old"]);
  });

  it("findDeferredActionForRecord finds evidence.deferredActionId", () => {
    expect(
      findDeferredActionForRecord(
        auditRecord("dec_defer", "2026-05-04T00:00:00.000Z", {
          evidence: {
            deferredActionId: "def_123"
          }
        }),
        [
          {
            id: "def_123",
            status: "pending",
            createdAt: "2026-05-04T00:00:00.000Z",
            requiredEvidence: [{ id: "req_1" }],
            satisfiedEvidence: [{ requirementId: "req_1" }]
          }
        ]
      )
    ).toMatchObject({
      id: "def_123",
      status: "pending",
      requiredEvidenceCount: 1,
      satisfiedEvidenceCount: 1
    });
  });

  it("findDeferredActionForRecord returns null when no id exists", () => {
    expect(
      findDeferredActionForRecord(
        auditRecord("dec_defer", "2026-05-04T00:00:00.000Z"),
        []
      )
    ).toBeNull();
  });

  it("buildObservationHints matches fetchPlan read_file target", () => {
    expect(
      buildObservationHints(
        auditRecord("dec_defer", "2026-05-04T00:00:00.000Z", {
          fetchPlan: [
            {
              type: "read_file",
              target: "README.md",
              safe: true
            }
          ]
        }),
        [
          {
            relativePath: "README.md",
            observedAt: "2026-05-04T00:01:00.000Z",
            metadataOnly: false
          }
        ]
      )
    ).toEqual([
      {
        target: "README.md",
        observed: true,
        observedAt: "2026-05-04T00:01:00.000Z",
        metadataOnly: false
      }
    ]);
  });

  it("buildObservationHints handles metadata-only observations", () => {
    expect(
      buildObservationHints(
        auditRecord("dec_defer", "2026-05-04T00:00:00.000Z", {
          fetchPlan: [
            {
              type: "read_file",
              target: "README.md",
              safe: true
            }
          ]
        }),
        [
          {
            relativePath: "README.md",
            observedAt: "2026-05-04T00:01:00.000Z",
            metadataOnly: true
          }
        ]
      )[0]
    ).toMatchObject({
      observed: true,
      metadataOnly: true
    });
  });

  it("sortValidationRecordsNewestFirst handles missing timestamps", () => {
    const records: UiValidationRecord[] = [
      { id: "missing", status: "passed" },
      { id: "new", status: "failed", completedAt: "2026-05-04T00:02:00.000Z" },
      { id: "old", status: "passed", completedAt: "2026-05-04T00:01:00.000Z" }
    ];

    expect(
      sortValidationRecordsNewestFirst(records).map((record) => record.id)
    ).toEqual(["new", "old", "missing"]);
  });

  it("buildLiveEmptyStateHints returns useful CLI suggestions", () => {
    expect(buildLiveEmptyStateHints("audit")).toEqual(
      expect.arrayContaining([
        'stepharbor exec "git status" --cwd .',
        "stepharbor doctor --cwd ."
      ])
    );
    expect(
      buildLiveEmptyStateHints("audit", { defaultPolicy: true })
    ).toContain("stepharbor init --template node");
    expect(buildLiveEmptyStateHints("validation")[0]).toContain(
      "stepharbor validate"
    );
  });

  it("buildGitRowsWithFallback uses live gitState when record has no git signals", () => {
    expect(
      buildGitRowsWithFallback(mockAuditRecords[0], {
        isGitRepo: true,
        currentBranch: "main",
        repoIntegrityStatus: "clean"
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Current branch",
          value: "main"
        })
      ])
    );
  });
});
