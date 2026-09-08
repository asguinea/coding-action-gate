import { describe, expect, it } from "vitest";

import type { CodingActionGatePolicy } from "../../src/domain/policies.js";
import {
  getValidationCommands,
  getValidationPolicyForAction
} from "../../src/validation/validationPolicy.js";

describe("validation policy helpers", () => {
  it("returns beforeCommit commands", () => {
    const policy: CodingActionGatePolicy = {
      version: "test",
      validation: {
        beforeCommit: {
          required: true,
          commands: ["npm test", "npm run lint"]
        }
      }
    };

    expect(getValidationCommands(policy, "before_commit")).toEqual({
      required: true,
      commands: ["npm test", "npm run lint"]
    });
  });

  it("returns beforePush commands", () => {
    const policy: CodingActionGatePolicy = {
      version: "test",
      validation: {
        beforePush: {
          required: true,
          commands: ["npm run build"]
        }
      }
    };

    expect(getValidationCommands(policy, "before_push")).toEqual({
      required: true,
      commands: ["npm run build"]
    });
  });

  it("returns not required with empty commands when policy is missing", () => {
    expect(getValidationCommands({ version: "test" }, "before_commit")).toEqual(
      {
        required: false,
        commands: []
      }
    );
  });

  it("keeps required true when commands are missing", () => {
    const policy: CodingActionGatePolicy = {
      version: "test",
      validation: {
        beforeCommit: {
          required: true
        }
      }
    };

    expect(getValidationCommands(policy, "before_commit")).toEqual({
      required: true,
      commands: []
    });
  });

  it("returns validation policy by supported action or target", () => {
    const policy: CodingActionGatePolicy = {
      version: "test",
      validation: {
        beforeCommit: {
          required: true,
          commands: ["npm test"]
        },
        beforePush: {
          required: true,
          commands: ["npm run build"]
        }
      }
    };

    expect(getValidationPolicyForAction(policy, "git_command")).toEqual(
      policy.validation?.beforeCommit
    );
    expect(getValidationPolicyForAction(policy, "before_push")).toEqual(
      policy.validation?.beforePush
    );
  });
});
