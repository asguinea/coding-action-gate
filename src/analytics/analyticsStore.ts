import { appendFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { AnalyticsEvent } from "./analyticsTypes.js";

export interface AnalyticsStoreOptions {
  cwd?: string;
}

export const resolveAnalyticsDir = (
  options: AnalyticsStoreOptions = {}
): string =>
  path.resolve(options.cwd ?? process.cwd(), ".stepharbor", "analytics");

export const resolveAnalyticsEventsPath = (
  options: AnalyticsStoreOptions = {}
): string => path.join(resolveAnalyticsDir(options), "events.jsonl");

export const appendAnalyticsEvent = async (
  event: AnalyticsEvent,
  options: AnalyticsStoreOptions = {}
): Promise<void> => {
  const eventPath = resolveAnalyticsEventsPath(options);

  await mkdir(path.dirname(eventPath), { recursive: true });
  await appendFile(eventPath, `${JSON.stringify(event)}\n`, "utf8");
};

export const readAnalyticsEvents = async (
  options: AnalyticsStoreOptions = {}
): Promise<AnalyticsEvent[]> => {
  const result = await readAnalyticsEventLog(options);

  return result.events;
};

export interface AnalyticsEventLogReadResult {
  events: AnalyticsEvent[];
  malformedLineCount: number;
  fileExists: boolean;
}

export const readAnalyticsEventLog = async (
  options: AnalyticsStoreOptions = {}
): Promise<AnalyticsEventLogReadResult> => {
  const eventPath = resolveAnalyticsEventsPath(options);

  try {
    const content = await readFile(eventPath, "utf8");
    const events: AnalyticsEvent[] = [];
    let malformedLineCount = 0;

    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) {
        continue;
      }

      try {
        events.push(JSON.parse(line) as AnalyticsEvent);
      } catch {
        malformedLineCount += 1;
      }
    }

    return {
      events,
      malformedLineCount,
      fileExists: true
    };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return {
        events: [],
        malformedLineCount: 0,
        fileExists: false
      };
    }

    throw error;
  }
};

export const clearAnalyticsEvents = async (
  options: AnalyticsStoreOptions = {}
): Promise<{
  cleared: boolean;
}> => {
  const eventPath = resolveAnalyticsEventsPath(options);

  try {
    await unlink(eventPath);
    return { cleared: true };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return { cleared: false };
    }

    throw error;
  }
};
