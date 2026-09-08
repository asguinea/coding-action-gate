import { cliExitCodes } from "../exitCodes.js";
import { recordDoctorRun } from "../../analytics/analyticsRecorder.js";
import {
  formatDoctorHuman,
  formatDoctorJson
} from "../../doctor/doctorFormat.js";
import { runDoctor } from "../../doctor/doctorRunner.js";
import type { DoctorOptions } from "../../doctor/doctorTypes.js";
import type { CliIO } from "../cli.js";

export interface DoctorCommandOptions extends DoctorOptions {
  json?: boolean;
}

export const runDoctorCommand = async (
  options: DoctorCommandOptions,
  io: CliIO
): Promise<number> => {
  const result = await runDoctor(options);
  await recordDoctorRun({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    result
  });

  if (options.json === true) {
    io.stdout.write(formatDoctorJson(result));
  } else {
    io.stdout.write(formatDoctorHuman(result));
  }

  return result.ok ? cliExitCodes.success : cliExitCodes.error;
};
