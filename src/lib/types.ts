export type HarnessName = "claude" | "opencode" | "codex" | "copilot";

export const HARNESSES: HarnessName[] = ["claude", "opencode", "codex", "copilot"];

export interface WorkflowStep {
  id: string;
  prompt_file?: string;
  prompt?: string;
  harness: HarnessName;
  model?: string;
  next_step: string;
  requires: {
    inputs: string[];
    outputs: string[];
  };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version?: string;
  harness?: HarnessName;
  model?: string;
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
