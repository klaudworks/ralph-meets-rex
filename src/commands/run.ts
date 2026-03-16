import { Command, Option } from "clipanion";
import { resolve } from "node:path";

import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { logger } from "../lib/logger";
import { createInitialRunState, generateRunId, saveRunState } from "../lib/run-state";
import { runWorkflow } from "../lib/runner";
import { loadWorkflowDefinition } from "../lib/workflow-loader";

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
      ["Run with extra variables", "$0 run .rex/workflows/feature.yml \"Ship feature\" --var issue_id=123 --var env=staging"],
      ["Disable auto-approval flags", "$0 run .rex/workflows/feature.yml \"Fix flaky tests\" --no-allow-all"]
    ]
  });

  public readonly workflowPath = Option.String({
    name: "workflow-path"
  });

  public readonly task = Option.String({
    name: "task"
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

  public async execute(): Promise<number> {
    const config = await loadConfig();
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
      task: this.task,
      vars: varsObject
    });
    const runPath = await saveRunState(config, runState);

    logger.header("Rex run initialized");
    logger.info(`workflow: ${workflowPath}`);
    logger.info(`workflow-id: ${workflow.id}`);
    logger.info(`task: ${this.task}`);
    logger.info(`allow-all: ${effectiveAllowAll}`);
    logger.info(`vars: ${parsedVars.length}`);
    logger.info(`run-id: ${runState.run_id}`);
    logger.info(`current-step: ${runState.current_step}`);
    logger.info(`run-file: ${runPath}`);

    await runWorkflow(config, workflow, runState, {
      allowAll: effectiveAllowAll
    });

    return 0;
  }
}
