import { describe, expect, it } from "vitest";

import { filterAuditRecords } from "../../ui/src/api/auditTimelineFormatters.js";
import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import {
  hasGitSignals,
  hasLandingSignals,
  hasValidationSignals
} from "../../ui/src/api/statusPanelFormatters.js";

const commands = mockAuditRecords.map((record) => record.action.command ?? "");
const targets = mockAuditRecords.map(
  (record) => record.action.targetPath ?? record.targetPaths?.join(",") ?? ""
);

describe("Phase 5 mock demo flow", () => {
  it("includes the expected demo decision categories", () => {
    expect(
      mockAuditRecords.some(
        (record) =>
          record.decision === "PROCEED" && targets.includes("README.md")
      )
    ).toBe(true);
    expect(
      mockAuditRecords.some(
        (record) =>
          record.decision === "DEFER" && targets.includes("src/service.ts")
      )
    ).toBe(true);
    expect(
      mockAuditRecords.some(
        (record) =>
          record.decision === "ESCALATE" &&
          (record.targetPaths ?? []).includes("auth/service.ts")
      )
    ).toBe(true);
    expect(
      mockAuditRecords.some(
        (record) => record.decision === "BLOCK" && targets.includes(".env")
      )
    ).toBe(true);
    expect(commands).toContain("git commit -m test");
    expect(commands).toContain("vercel deploy --prod");
  });

  it("includes records that exercise Git, validation, and landing panels", () => {
    expect(mockAuditRecords.some((record) => hasGitSignals(record))).toBe(true);
    expect(
      mockAuditRecords.some((record) => hasValidationSignals(record))
    ).toBe(true);
    expect(mockAuditRecords.some((record) => hasLandingSignals(record))).toBe(
      true
    );
  });

  it("timeline filtering still finds the production deploy mock", () => {
    expect(
      filterAuditRecords(mockAuditRecords, {
        decision: "BLOCK",
        actionType: "run_command",
        search: "prod"
      }).map((record) => record.decisionId)
    ).toEqual(["dec_mock_prod_deploy_block"]);
  });
});
