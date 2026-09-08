import type { CodingActionGatePolicy } from "../domain/policies.js";

export type PolicyTemplateName = "basic" | "node" | "strict" | "monorepo-lite";

export interface PolicyTemplate {
  name: PolicyTemplateName;
  description: string;
  policy: CodingActionGatePolicy;
}

export interface RenderPolicyTemplateOptions {
  includeHeader?: boolean;
}
