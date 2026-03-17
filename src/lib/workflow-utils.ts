import type { WorkflowDefinition } from "./types";

export function workflowRequiresTask(workflow: WorkflowDefinition): boolean {
  return workflow.steps.some((step) => step.requires.inputs.includes("task"));
}

export function getWorkflowDefaultHarness(workflow: WorkflowDefinition): string {
  return workflow.harness ?? "(none - step-level harnesses only)";
}
