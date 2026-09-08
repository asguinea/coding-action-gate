import { deferredActionRecordSchema } from "../defer/deferredActionTypes.js";
import { resolveDeferredActionLogPath } from "../defer/deferredActionPaths.js";
import { readJsonlRecords } from "./jsonlReader.js";
import type {
  ReadDeferredActionsOptions,
  UiDeferredActionRecord
} from "./uiAdapterTypes.js";

export const readDeferredActions = async (
  options: ReadDeferredActionsOptions = {}
): Promise<UiDeferredActionRecord[]> =>
  readJsonlRecords({
    filePath: resolveDeferredActionLogPath({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.deferDir !== undefined ? { deferDir: options.deferDir } : {}),
      ...(options.sessionId !== undefined
        ? { sessionId: options.sessionId }
        : {})
    }),
    schema: deferredActionRecordSchema,
    ...(options.limit !== undefined ? { limit: options.limit } : {})
  });
