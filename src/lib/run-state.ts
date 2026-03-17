import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { RmrConfig } from "./config";
import { StorageError } from "./errors";
import type { RunState, WorkflowDefinition } from "./types";

function pad(input: number): string {
  return String(input).padStart(2, "0");
}

export function generateRunId(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const hh = pad(now.getUTCHours());
  const min = pad(now.getUTCMinutes());
  const sec = pad(now.getUTCSeconds());

  return `${yyyy}${mm}${dd}-${hh}${min}${sec}Z`;
}

export function runFilePath(config: RmrConfig, runId: string): string {
  return resolve(config.runsDir, `${runId}.json`);
}

export function runLogPath(config: RmrConfig, runId: string): string {
  return resolve(config.runsDir, `${runId}.log`);
}

export async function appendToRunLog(
  config: RmrConfig,
  runId: string,
  content: string
): Promise<string> {
  const path = runLogPath(config, runId);
  await appendFile(path, content, "utf8");
  return path;
}

export function createInitialRunState(options: {
  runId: string;
  workflowPath: string;
  workflow: WorkflowDefinition;
  task: string;
  vars: Record<string, string>;
}): RunState {
  const firstStep = options.workflow.steps[0];
  if (!firstStep) {
    throw new StorageError("Cannot create run state without at least one workflow step.");
  }

  return {
    run_id: options.runId,
    workflow_path: options.workflowPath,
    status: "running",
    current_step: firstStep.id,
    context: {
      task: options.task,
      ...options.vars
    },
    last_harness: {
      name: firstStep.harness,
      binary: firstStep.harness,
      session_id: null
    },
    step_history: [],
    updated_at: new Date().toISOString()
  };
}

export async function saveRunState(config: RmrConfig, state: RunState): Promise<string> {
  const path = runFilePath(config, state.run_id);
  const payload = JSON.stringify(
    {
      ...state,
      updated_at: new Date().toISOString()
    },
    null,
    2
  );

  await writeFile(path, `${payload}\n`, "utf8");
  return path;
}

export async function loadRunState(config: RmrConfig, runId: string): Promise<RunState> {
  const path = runFilePath(config, runId);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as RunState;

    if (!parsed || typeof parsed !== "object" || parsed.run_id !== runId) {
      throw new StorageError(`Run state file is invalid for run id "${runId}".`);
    }

    // Handle migration from old run states without step_history
    if (!Array.isArray(parsed.step_history)) {
      parsed.step_history = [];
    }

    return parsed;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }

    throw new StorageError(`Failed to load run state for "${runId}".`);
  }
}
