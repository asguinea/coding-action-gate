import { readFile } from "node:fs/promises";
import { z, type ZodSchema } from "zod";

export interface JsonlReadOptions<T> {
  filePath: string;
  schema: ZodSchema<T>;
  limit?: number;
}

const normalizeLimit = (limit: number | undefined): number | undefined =>
  Number.isInteger(limit) && limit !== undefined && limit >= 0
    ? limit
    : undefined;

export const applyLimit = <T>(records: T[], limit?: number): T[] => {
  const normalizedLimit = normalizeLimit(limit);

  if (normalizedLimit === undefined) {
    return records;
  }

  if (normalizedLimit === 0) {
    return [];
  }

  return records.slice(-normalizedLimit);
};

export const readJsonlRecords = async <T>(
  options: JsonlReadOptions<T>
): Promise<T[]> => {
  let content: string;

  try {
    content = await readFile(options.filePath, "utf8");
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT" || code === "ENOTDIR") {
      return [];
    }

    throw error;
  }

  const records = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        const result = options.schema.safeParse(parsed);

        return result.success ? [result.data] : [];
      } catch {
        return [];
      }
    });

  return applyLimit(z.array(options.schema).parse(records), options.limit);
};
