import { validationResultRecordSchema } from "../validation/validationTypes.js";
import { resolveValidationLogPath } from "../validation/validationPaths.js";
import { readJsonlRecords } from "./jsonlReader.js";
import type {
  ReadValidationRecordsOptions,
  UiValidationRecord
} from "./uiAdapterTypes.js";

export const readValidationRecords = async (
  options: ReadValidationRecordsOptions = {}
): Promise<UiValidationRecord[]> =>
  readJsonlRecords({
    filePath: resolveValidationLogPath({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.validationDir !== undefined
        ? { validationDir: options.validationDir }
        : {}),
      ...(options.sessionId !== undefined
        ? { sessionId: options.sessionId }
        : {})
    }),
    schema: validationResultRecordSchema,
    ...(options.limit !== undefined ? { limit: options.limit } : {})
  });
