export type ProviderName = "claude" | "claude-code" | "opencode" | "codex" | "copilot";

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
  agents: WorkflowAgent[];
  steps: WorkflowStep[];
}

export interface LastProviderState {
  name: ProviderName;
  binary: string;
  session_id: string | null;
}

export type RunStatus = "running" | "paused_human" | "done";

export interface RunState {
  run_id: string;
  workflow_path: string;
  status: RunStatus;
  current_step: string;
  context: Record<string, string>;
  last_provider: LastProviderState | null;
  updated_at: string;
}
