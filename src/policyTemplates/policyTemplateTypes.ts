import type { StepHarborPolicy } from "../domain/policies.js";

export type PolicyTemplateName = "basic" | "node" | "strict" | "monorepo-lite";

export interface PolicyTemplate {
  name: PolicyTemplateName;
  description: string;
  policy: StepHarborPolicy;
}

export interface RenderPolicyTemplateOptions {
  includeHeader?: boolean;
}
