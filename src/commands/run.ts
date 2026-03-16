import { Command, Option } from "clipanion";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { parseHarnessOverride, type HarnessName } from "../lib/types";
import { startUpdateCheck } from "../lib/update-check";
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
      "Loads and validates the workflow, creates a new run state under `.rmr/runs/`, then executes steps until the run reaches `done` or pauses for human intervention.",
    examples: [
      [
        "Run with task flag",
        "$0 run .rmr/workflows/feature-dev/workflow.yaml --task \"Implement auth middleware\""
      ],
      ["Run with task file", "$0 run .rmr/workflows/feature-dev/workflow.yaml --task-file task.md"],
      [
        "Override harness",
        "$0 run .rmr/workflows/feature-dev/workflow.yaml --task \"Fix bug\" --harness opencode"
      ],
      [
        "Override model",
        "$0 run .rmr/workflows/feature-dev/workflow.yaml --task \"Fix bug\" --model openai/gpt-5.3-codex-high"
      ],
      [
        "Run with extra variables",
        "$0 run .rmr/workflows/feature-dev/workflow.yaml --task \"Ship feature\" --var issue_id=123 --var env=staging"
      ],
      [
        "Disable auto-approval flags",
        "$0 run .rmr/workflows/feature-dev/workflow.yaml --task \"Fix flaky tests\" --no-allow-all"
      ]
    ]
  });

  public readonly workflowPath = Option.String({
    name: "workflow-path"
  });

  public readonly taskFlag = Option.String("--task,-t", {
    required: false,
    description: "Task description (mutually exclusive with --task-file)."
  });

  public readonly taskFile = Option.String("--task-file,-f", {
    required: false,
    description: "Path to file containing task description."
  });

  public readonly harness = Option.String("--harness", {
    required: false,
    description: "Override harness for all workflow steps."
  });

  public readonly model = Option.String("--model", {
    required: false,
    description: "Override model for all workflow steps (e.g., openai/gpt-5.3-codex-high)."
  });

  public readonly vars = Option.Array("--var", [], {
    description: "Inject initial variables as key=value (repeatable)."
  });

  public readonly allowAll = Option.Boolean("--allow-all", true, {
    description: "Enable harness auto-approval flags when supported (default: true)."
  });

  public readonly noAllowAll = Option.Boolean("--no-allow-all", false, {
    description: "Disable harness auto-approval flags."
  });

  private async resolveTask(): Promise<{ task: string; displayTask: string }> {
    if (this.taskFile && this.taskFlag) {
      throw new UserInputError("Cannot specify both --task and --task-file.");
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

    // No task provided - prompt interactively if TTY, otherwise error
    if (process.stdin.isTTY) {
      ui.warning("No task provided. Please enter your task below.");
      const task = await ui.prompt("Task: ");
      const trimmedTask = task.trim();
      if (!trimmedTask) {
        throw new UserInputError("Task cannot be empty.");
      }
      return { task: trimmedTask, displayTask: trimmedTask };
    }

    throw new UserInputError("No task provided. Use --task/-t or --task-file/-f.");
  }

  public async execute(): Promise<number> {
    const showUpdateNotice = startUpdateCheck();
    const config = await loadConfig();
    const { task, displayTask } = await this.resolveTask();
    const harnessOverride = parseHarnessOverride(this.harness);
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
      title: "rmr config",
      workflow: workflowPath,
      workflowId: workflow.id,
      task: displayTask,
      runId: runState.run_id,
      currentStep: runState.current_step,
      runFile: runPath,
      allowAll: effectiveAllowAll,
      harness: this.harness,
      model: this.model,
      varsCount: parsedVars.length
    });

    const overrides: {
      harness?: HarnessName;
      model?: string;
    } = {};

    if (harnessOverride) {
      overrides.harness = harnessOverride;
    }
    if (this.model) {
      overrides.model = this.model;
    }

    await runWorkflow(config, workflow, runState, {
      allowAll: effectiveAllowAll,
      ...(Object.keys(overrides).length > 0 && { overrides })
    });

    showUpdateNotice();
    return 0;
  }
}
