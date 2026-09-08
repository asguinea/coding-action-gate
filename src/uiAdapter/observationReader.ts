import { fileObservationRecordSchema } from "../observations/fileObservationTypes.js";
import { resolveObservationLogPath } from "../observations/observationPaths.js";
import { readJsonlRecords } from "./jsonlReader.js";
import type {
  ReadObservationsOptions,
  UiObservationRecord
} from "./uiAdapterTypes.js";

export const readObservations = async (
  options: ReadObservationsOptions = {}
): Promise<UiObservationRecord[]> =>
  readJsonlRecords({
    filePath: resolveObservationLogPath({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.observationDir !== undefined
        ? { observationDir: options.observationDir }
        : {}),
      ...(options.sessionId !== undefined
        ? { sessionId: options.sessionId }
        : {})
    }),
    schema: fileObservationRecordSchema,
    ...(options.limit !== undefined ? { limit: options.limit } : {})
  });
