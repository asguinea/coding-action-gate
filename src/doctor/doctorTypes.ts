export type DoctorCheckStatus = "pass" | "warn" | "fail" | "info";

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
  remediation?: string;
}

export interface DoctorSummary {
  pass: number;
  warn: number;
  fail: number;
  info: number;
}

export interface DoctorResult {
  ok: boolean;
  summary: DoctorSummary;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  cwd?: string;
  policy?: string;
  checkApiPort?: number;
  skipPortCheck?: boolean;
  uiDistDir?: string;
}
