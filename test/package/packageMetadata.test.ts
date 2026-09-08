import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("package distribution", () => {
  it("exposes CLI and library entrypoints and restricts packed content", async () => {
    const metadata = JSON.parse(await readFile("package.json", "utf8"));
    expect(metadata.name).toBe("coding-action-gate");
    expect(metadata.bin["coding-action-gate"]).toBe("dist/cli/cli.js");
    expect(metadata.main).toBe("dist/index.js");
    expect(metadata.types).toBe("dist/index.d.ts");
    expect(metadata.private).toBe(true);
    expect(metadata.files).toEqual(
      expect.arrayContaining(["dist", "ui/dist", "docs"])
    );
    expect(metadata.files).not.toContain("research");
  });
});
