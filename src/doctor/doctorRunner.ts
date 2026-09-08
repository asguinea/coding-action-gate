import { buildDoctorChecks, summarizeDoctorChecks } from "./doctorChecks.js";
import type { DoctorOptions, DoctorResult } from "./doctorTypes.js";

export const runDoctor = async (
  options: DoctorOptions = {}
): Promise<DoctorResult> => {
  const checks = await buildDoctorChecks(options);
  const summary = summarizeDoctorChecks(checks);

  return {
    ok: summary.fail === 0,
    summary,
    checks
  };
};
