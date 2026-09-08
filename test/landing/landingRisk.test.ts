import { describe, expect, it } from "vitest";

import { computeLandingRisk } from "../../src/landing/landingRisk.js";

describe("landing risk", () => {
  it("is critical for direct mainline push", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "push"
        },
        directMainlinePush: true
      })
    ).toMatchObject({ landingRisk: "critical" });
  });

  it("is critical for force push", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "push"
        },
        forcePush: true
      })
    ).toMatchObject({ landingRisk: "critical" });
  });

  it("is high for deploy with unknown environment", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "deploy"
        },
        command: "vercel deploy"
      })
    ).toMatchObject({
      landingRisk: "high",
      deploymentRisk: "high",
      environmentClassification: "unknown"
    });
  });

  it("is critical for production deploy", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "deploy"
        },
        command: "vercel deploy --prod"
      })
    ).toMatchObject({
      landingRisk: "critical",
      deploymentRisk: "critical",
      environmentClassification: "production"
    });
  });

  it("is high for publish", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "publish"
        }
      })
    ).toMatchObject({
      landingRisk: "high",
      releaseRisk: "high"
    });
  });

  it("is high for commit on protected branch", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "commit"
        },
        protectedBranch: true
      })
    ).toMatchObject({ landingRisk: "high" });
  });

  it("is medium for feature branch commit", () => {
    expect(
      computeLandingRisk({
        classification: {
          landingAction: true,
          landingActionType: "commit"
        },
        protectedBranch: false
      })
    ).toMatchObject({ landingRisk: "medium" });
  });
});
