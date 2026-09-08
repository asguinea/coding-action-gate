import type { DoctorCheck, DoctorResult } from "./doctorTypes.js";

const statusLabels: Record<DoctorCheck["status"], string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  info: "INFO"
};

const uniqueRemediations = (checks: DoctorCheck[]): string[] => {
  const seen = new Set<string>();
  const remediations: string[] = [];

  for (const check of checks) {
    if (check.remediation === undefined || seen.has(check.remediation)) {
      continue;
    }

    seen.add(check.remediation);
    remediations.push(check.remediation);
  }

  return remediations;
};

const defaultFirstRunSteps = [
  "Run `coding-action-gate init` if this repo is not initialized.",
  'Try `coding-action-gate exec "echo hello"` for a safe dry-run.',
  "Use `coding-action-gate help defer` to understand DEFER.",
  "Run `coding-action-gate ui` to inspect local runtime state.",
  "For install/package issues, run `coding-action-gate help install`."
];

const uniqueNextSteps = (checks: DoctorCheck[]): string[] => {
  const seen = new Set<string>();
  const steps: string[] = [];

  for (const step of [...uniqueRemediations(checks), ...defaultFirstRunSteps]) {
    if (
      step === "Run `coding-action-gate ui` to inspect local runtime state." &&
      steps.some((existing) => existing.includes("coding-action-gate ui"))
    ) {
      continue;
    }

    if (seen.has(step)) {
      continue;
    }

    seen.add(step);
    steps.push(step);
  }

  return steps;
};

export const formatDoctorJson = (result: DoctorResult): string =>
  `${JSON.stringify(result, null, 2)}\n`;

export const formatDoctorHuman = (result: DoctorResult): string => {
  const lines = ["CodingActionGate doctor", ""];

  for (const check of result.checks) {
    lines.push(
      `${statusLabels[check.status].padEnd(5)} ${check.label}: ${check.message}`
    );
  }

  lines.push(
    "",
    "Summary:",
    `  pass: ${result.summary.pass}`,
    `  warn: ${result.summary.warn}`,
    `  fail: ${result.summary.fail}`,
    `  info: ${result.summary.info}`
  );

  const nextSteps = uniqueNextSteps(result.checks);

  if (nextSteps.length > 0) {
    lines.push("", "Next steps:");

    for (const [index, step] of nextSteps.entries()) {
      lines.push(`  ${index + 1}. ${step}`);
    }
  }

  return `${lines.join("\n")}\n`;
};
