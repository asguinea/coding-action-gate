import type { DecisionPosture } from "../domain/decisions.js";

const decisionSeverity: Record<DecisionPosture, number> = {
  PROCEED: 0,
  DEFER: 1,
  ESCALATE: 2,
  BLOCK: 3
};

export const compareDecisionPostures = (
  left: DecisionPosture,
  right: DecisionPosture
): number => decisionSeverity[left] - decisionSeverity[right];

export const isMoreSevereDecision = (
  candidate: DecisionPosture,
  current: DecisionPosture
): boolean => compareDecisionPostures(candidate, current) > 0;

export const highestSeverityDecision = (
  decisions: DecisionPosture[]
): DecisionPosture =>
  decisions.reduce<DecisionPosture>(
    (current, candidate) =>
      isMoreSevereDecision(candidate, current) ? candidate : current,
    "PROCEED"
  );
