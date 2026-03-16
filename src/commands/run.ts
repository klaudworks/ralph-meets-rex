import { Command, Option } from "clipanion";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { parseProviderOverride, type ProviderName } from "../lib/types";
import { createInitialRunState, generateRunId, saveRunState } from "../lib/run-state";
import { runWorkflow } from "../lib/runner";
import { loadWorkflowDefinition } from "../lib/workflow-loader";
import { ui } from "../lib/ui";

interface ParsedVar {
  key: string;
  value: string;
}

function parseVar(input: string): ParsedVar {
  const index = input.indexOf("=");
  if (index < 1 || index === input.length - 1) {
    throw new UserInputError(`Invalid --var value "${input}". Expected key=value.`);
  }

  return {
    key: input.slice(0, index).trim(),
    value: input.slice(index + 1).trim()
  };
}

export class RunCommand extends Command {
  public static paths = [["run"]];

  public static usage = Command.Usage({
    category: "Workflow",
    description: "Start a new workflow run from a workflow YAML file.",
    details:
      "Loads and validates the workflow, creates a new run state under `.rex/runs/`, then executes steps until the run reaches `done` or pauses for human intervention.",
    examples: [
      ["Run minimal workflow", "$0 run .rex/workflows/quick.yml \"Implement auth middleware\""],
      ["Run with task flag", "$0 run .rex/workflows/quick.yml --task \"Implement auth middleware\""],
      ["Run with task file", "$0 run .rex/workflows/quick.yml --task-file task.md"],
      ["Override provider", "$0 run .rex/workflows/quick.yml \"Fix bug\" --provider opencode"],
      ["Override model", "$0 run .rex/workflows/quick.yml \"Fix bug\" --model openai/gpt-5.3-codex-high"],
      ["Run with extra variables", "$0 run .rex/workflows/feature.yml \"Ship feature\" --var issue_id=123 --var env=staging"],
      ["Disable auto-approval flags", "$0 run .rex/workflows/feature.yml \"Fix flaky tests\" --no-allow-all"]
    ]
  });

  public readonly workflowPath = Option.String({
    name: "workflow-path"
  });

  public readonly positionalTask = Option.String({
    name: "task",
    required: false
  });

  public readonly taskFlag = Option.String("--task,-t", {
    required: false,
    description: "Task description (alternative to positional argument)."
  });

  public readonly taskFile = Option.String("--task-file,-f", {
    required: false,
    description: "Path to file containing task description."
  });

  public readonly provider = Option.String("--provider", {
    required: false,
    description: "Override provider for all workflow steps."
  });

  public readonly model = Option.String("--model", {
    required: false,
    description: "Override model for all workflow steps (e.g., openai/gpt-5.3-codex-high)."
  });

  public readonly vars = Option.Array("--var", [], {
    description: "Inject initial variables as key=value (repeatable)."
  });

  public readonly allowAll = Option.Boolean("--allow-all", true, {
    description: "Enable provider auto-approval flags when supported (default: true)."
  });

  public readonly noAllowAll = Option.Boolean("--no-allow-all", false, {
    description: "Disable provider auto-approval flags."
  });

  private async resolveTask(): Promise<{ task: string; displayTask: string }> {
    if (this.taskFile && this.taskFlag) {
      throw new UserInputError("Cannot specify both --task and --task-file.");
    }

    if (this.taskFile && this.positionalTask) {
      throw new UserInputError("Cannot specify both positional task and --task-file.");
    }

    if (this.taskFlag && this.positionalTask) {
      throw new UserInputError("Cannot specify both positional task and --task.");
    }

    if (this.taskFile) {
      try {
        const content = await readFile(resolve(this.taskFile), "utf-8");
        const task = content.trim();
        return { task, displayTask: `(file: ${this.taskFile})` };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new UserInputError(`Failed to read task file "${this.taskFile}": ${message}`);
      }
    }

    if (this.taskFlag) {
      return { task: this.taskFlag, displayTask: this.taskFlag };
    }

    if (this.positionalTask) {
      return { task: this.positionalTask, displayTask: this.positionalTask };
    }

    throw new UserInputError("No task provided. Use positional argument, --task, or --task-file.");
  }

  public async execute(): Promise<number> {
    const config = await loadConfig();
    const { task, displayTask } = await this.resolveTask();
    const providerOverride = parseProviderOverride(this.provider);
    const parsedVars = this.vars.map(parseVar);
    const effectiveAllowAll = this.noAllowAll ? false : this.allowAll;
    const varsObject = Object.fromEntries(parsedVars.map((entry) => [entry.key, entry.value]));
    const workflowPath = resolve(this.workflowPath);
    const workflow = await loadWorkflowDefinition(workflowPath);
    const runId = generateRunId();
    const runState = createInitialRunState({
      runId,
      workflowPath,
      workflow,
      task,
      vars: varsObject
    });
    const runPath = await saveRunState(config, runState);

    ui.workflowHeader({
      title: "rex config",
      workflow: workflowPath,
      workflowId: workflow.id,
      task: displayTask,
      runId: runState.run_id,
      currentStep: runState.current_step,
      runFile: runPath,
      allowAll: effectiveAllowAll,
      provider: this.provider,
      model: this.model,
      varsCount: parsedVars.length
    });

    const overrides: {
      provider?: ProviderName;
      model?: string;
    } = {};

    if (providerOverride) {
      overrides.provider = providerOverride;
    }
    if (this.model) {
      overrides.model = this.model;
    }

    await runWorkflow(config, workflow, runState, {
      allowAll: effectiveAllowAll,
      ...(Object.keys(overrides).length > 0 && { overrides })
    });

    return 0;
  }
}
