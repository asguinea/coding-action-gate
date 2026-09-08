import rawAgentActionProtocol from "./example-agent-action-protocol.json" with { type: "json" };
import rawPhase16GateSummary from "../production-routing/example-phase-16-gate-summary.json" with { type: "json" };
import { validatePhase16GateSummary } from "../production-routing/phase16GateSummarySchema.js";
import {
  buildAgentActionProtocolFromPhase16GateSummary,
  type AgentActionProtocol,
  validateAgentActionProtocol
} from "./actionProtocolSchema.js";

export const loadAgentActionProtocolExample = (): AgentActionProtocol =>
  validateAgentActionProtocol(rawAgentActionProtocol);

export const buildExampleAgentActionProtocol = (): AgentActionProtocol => {
  const phase16GateSummary = validatePhase16GateSummary(rawPhase16GateSummary);
  return buildAgentActionProtocolFromPhase16GateSummary(phase16GateSummary);
};
