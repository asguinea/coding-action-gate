import { describe, expect, it } from "vitest";

import { normalizeAction } from "../../src/actions/normalizeAction.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import { classifyLandingAction } from "../../src/landing/landingActionClassifier.js";

const normalize = (command: string) => {
  const action: StepHarborAction = {
    id: "act",
    type: "run_command",
    timestamp: "2026-05-02T00:00:00.000Z",
    proposedBy: "agent",
    command
  };
  const result = normalizeAction(action, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

describe("landing action classifier", () => {
  it("classifies git commit as commit landing action", () => {
    expect(
      classifyLandingAction(normalize("git commit -m test"))
    ).toMatchObject({
      landingAction: true,
      landingActionType: "commit"
    });
  });

  it("classifies git push as push landing action", () => {
    expect(classifyLandingAction(normalize("git push"))).toMatchObject({
      landingAction: true,
      landingActionType: "push"
    });
  });

  it("classifies git merge as merge landing action", () => {
    expect(classifyLandingAction(normalize("git merge feature"))).toMatchObject(
      {
        landingAction: true,
        landingActionType: "merge"
      }
    );
  });

  it("classifies git rebase as rebase landing action", () => {
    expect(classifyLandingAction(normalize("git rebase main"))).toMatchObject({
      landingAction: true,
      landingActionType: "rebase"
    });
  });

  it("classifies vercel deploy as deploy", () => {
    expect(classifyLandingAction(normalize("vercel deploy"))).toMatchObject({
      landingAction: true,
      landingActionType: "deploy"
    });
  });

  it("classifies kubectl apply as deploy", () => {
    expect(
      classifyLandingAction(normalize("kubectl apply -f app.yml"))
    ).toMatchObject({
      landingAction: true,
      landingActionType: "deploy"
    });
  });

  it("classifies terraform apply as deploy", () => {
    expect(classifyLandingAction(normalize("terraform apply"))).toMatchObject({
      landingAction: true,
      landingActionType: "deploy"
    });
  });

  it("classifies npm publish as publish", () => {
    expect(classifyLandingAction(normalize("npm publish"))).toMatchObject({
      landingAction: true,
      landingActionType: "publish"
    });
  });

  it("classifies gh release create as release", () => {
    expect(
      classifyLandingAction(normalize("gh release create v1.0.0"))
    ).toMatchObject({
      landingAction: true,
      landingActionType: "release"
    });
  });

  it("does not classify git status as a landing action", () => {
    expect(classifyLandingAction(normalize("git status"))).toMatchObject({
      landingAction: false
    });
  });
});
