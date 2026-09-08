import { describe, expect, it } from "vitest";
import { computeAuditRecordHash } from "../../src/audit/auditHash.js";
import type { AuditRecord } from "../../src/domain/audit.js";

const baseRecord = (): AuditRecord => ({
  decisionId: "decision-1",
  timestamp: "2026-04-26T04:00:00.000Z",
  action: {
    id: "action-read-file-1",
    type: "read_file",
    timestamp: "2026-04-26T04:00:00.000Z",
    proposedBy: "agent",
    targetPath: "src/index.ts"
  },
  targetPaths: ["src/index.ts"],
  decision: "PROCEED",
  reason: "Allowed.",
  policyTrace: [],
  evidence: {
    b: 2,
    a: 1
  },
  approvalStatus: "not_required"
});

describe("computeAuditRecordHash", () => {
  it("is stable for equivalent records", () => {
    const first = baseRecord();
    const second: AuditRecord = {
      ...baseRecord(),
      evidence: {
        a: 1,
        b: 2
      }
    };

    expect(computeAuditRecordHash(first)).toBe(computeAuditRecordHash(second));
  });

  it("does not include recordHash in hash input", () => {
    const first = {
      ...baseRecord(),
      recordHash: "first"
    };
    const second = {
      ...baseRecord(),
      recordHash: "second"
    };

    expect(computeAuditRecordHash(first)).toBe(computeAuditRecordHash(second));
  });
});
