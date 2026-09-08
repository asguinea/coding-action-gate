import { describe, expect, it } from "vitest";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { createCliError } from "../../src/cli/cliErrors.js";
import { formatJsonOutput } from "../../src/cli/cliOutput.js";

const fakeToken = "sk-abcdefghijklmnopqrstuvwxyz123456";

describe("CLI redaction", () => {
  it("redacts command values in JSON output", async () => {
    const result = await runExecCommand({
      command: `echo ${fakeToken}`,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const output = formatJsonOutput(result.output);

      expect(output).not.toContain(fakeToken);
      expect(output).toContain("[REDACTED]");
      expect(output).toContain('"dryRun": true');
      expect(output).toContain('"executed": false');
    }
  });

  it("redacts JSON error details", () => {
    const output = formatJsonOutput({
      ok: false,
      error: createCliError("CLI_ACTION_PARSE_ERROR", "Invalid action.", {
        raw: fakeToken
      })
    });

    expect(output).not.toContain(fakeToken);
    expect(output).toContain("[REDACTED]");
  });
});
