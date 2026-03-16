import { UserInputError } from "./errors";

export type HarnessName = "claude" | "opencode" | "codex" | "copilot";

export const HARNESSES: HarnessName[] = ["claude", "opencode", "codex", "copilot"];

export function parseHarnessOverride(value: string | undefined): HarnessName | undefined {
  if (!value) {
    return undefined;
  }

  if (!HARNESSES.includes(value as HarnessName)) {
    throw new UserInputError(
      `Invalid harness override "${value}". Expected one of: ${HARNESSES.join(", ")}.`
    );
  }

  return value as HarnessName;
}

export interface WorkflowAgent {
  id: string;
  harness: HarnessName;
  prompt: string;
  model?: string;
}

export interface WorkflowStep {
  id: string;
  agent: string;
  default_next: string;
  input_required: string[];
  outputs: {
    required: string[];
  };
  input: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version?: string;
  agents: WorkflowAgent[];
  steps: WorkflowStep[];
}

export interface LastHarnessState {
  name: HarnessName;
  binary: string;
  session_id: string | null;
}

export interface StepExecution {
  step_number: number;
  step_id: string;
  agent_id: string;
  session_id: string | null;
  started_at: string;
  completed_at: string;
}

export type RunStatus = "running" | "paused_human" | "done";

export interface RunState {
  run_id: string;
  workflow_path: string;
  status: RunStatus;
  current_step: string;
  context: Record<string, string>;
  last_harness: LastHarnessState | null;
  step_history: StepExecution[];
  updated_at: string;
}
