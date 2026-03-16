import { UserInputError } from "./errors";

export type ProviderName = "claude" | "opencode" | "codex" | "copilot";

export const PROVIDERS: ProviderName[] = ["claude", "opencode", "codex", "copilot"];

export function parseProviderOverride(value: string | undefined): ProviderName | undefined {
  if (!value) {
    return undefined;
  }

  if (!PROVIDERS.includes(value as ProviderName)) {
    throw new UserInputError(
      `Invalid provider override "${value}". Expected one of: ${PROVIDERS.join(", ")}.`
    );
  }

  return value as ProviderName;
}

export interface WorkflowAgent {
  id: string;
  provider: ProviderName;
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

export interface LastProviderState {
  name: ProviderName;
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
  last_provider: LastProviderState | null;
  step_history: StepExecution[];
  updated_at: string;
}
