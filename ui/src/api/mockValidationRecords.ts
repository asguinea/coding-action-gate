import type { UiValidationRecord } from "./types.js";

export const mockValidationRecords: UiValidationRecord[] = [
  {
    id: "val_mock_test_passed",
    kind: "test",
    command: 'node -e "process.exit(0)"',
    status: "passed",
    exitCode: 0,
    completedAt: "2026-05-03T09:58:00.000Z"
  },
  {
    id: "val_mock_lint_failed",
    kind: "lint",
    command: "npm run lint",
    status: "failed",
    exitCode: 1,
    completedAt: "2026-05-03T10:02:00.000Z"
  },
  {
    id: "val_mock_build_passed",
    kind: "build",
    command: "npm run build",
    status: "passed",
    exitCode: 0,
    completedAt: "2026-05-03T10:12:00.000Z"
  }
];
