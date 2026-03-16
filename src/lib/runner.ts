import type { RmrConfig } from "./config";
import { loadAgentPrompt, composePrompt } from "./prompt-composer";
import { getHarnessAdapter } from "./harness-adapters";
import { runHarnessCommand } from "./process-runner";
import { parseRmrOutput, validateRequiredOutputKeys } from "./rmr-output-parser";
import { saveRunState } from "./run-state";
import { assertRequiredInputs, resolveTemplate } from "./templating";
import type { HarnessName, RunState, StepExecution, WorkflowDefinition, WorkflowStep } from "./types";
import { ui } from "./ui";

const HUMAN_SENTINEL = "HUMAN_INTERVENTION_REQUIRED";

interface ContinueOverrides {
  stepId?: string;
  harness?: HarnessName;
  model?: string;
  sessionId?: string;
  hint?: string;
}

function findStep(workflow: WorkflowDefinition, stepId: string): WorkflowStep | undefined {
  return workflow.steps.find((step) => step.id === stepId);
}

function isValidTarget(workflow: WorkflowDefinition, target: string): boolean {
  if (target === "done" || target === "human_intervention") {
    return true;
  }

  return workflow.steps.some((step) => step.id === target);
}

function outputSnippet(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return "(no output)";
  }

  const compact = trimmed.replace(/\s+/g, " ");
  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}

function harnessExitReason(params: {
  stepId: string;
  harness: HarnessName;
  model?: string;
  exitCode: number;
  stderr: string;
  combinedOutput: string;
}): string {
  const stderrSnippet = outputSnippet(params.stderr);
  const outputPreview = outputSnippet(params.combinedOutput);
  const details: string[] = [`harness=${params.harness}`];

  if (params.model) {
    details.push(`model=${params.model}`);
  }

  if (stderrSnippet !== "(no output)") {
    details.push(`stderr=${stderrSnippet}`);
  } else if (outputPreview !== "(no output)") {
    details.push(`output=${outputPreview}`);
  }

  return `Harness exited with code ${params.exitCode} at step "${params.stepId}" (${details.join("; ")}).`;
}

async function pauseRun(
  config: RmrConfig,
  runState: RunState,
  reason: string,
  harnessName: HarnessName,
  sessionId: string | null
): Promise<void> {
  runState.status = "paused_human";
  await saveRunState(config, runState);

  const adapter = getHarnessAdapter(harnessName);
  const resolvedSession = sessionId ?? "<session-id>";

  ui.pauseInstructions({
    reason,
    runId: runState.run_id,
    resumeCommand: adapter.resumeTemplate(resolvedSession)
  });
}

function applyOutputToContext(
  context: Record<string, string>,
  agentId: string,
  values: Record<string, string>
): void {
  for (const [key, value] of Object.entries(values)) {
    if (key === "status" || key === "next_state") {
      continue;
    }

    context[`${agentId}.${key}`] = value;
  }
}

export async function runWorkflow(
  config: RmrConfig,
  workflow: WorkflowDefinition,
  runState: RunState,
  options: {
    allowAll: boolean;
    overrides?: ContinueOverrides;
  }
): Promise<RunState> {
  if (options.overrides?.stepId) {
    runState.current_step = options.overrides.stepId;
  }

  let isFirstIteration = true;
  let stepNumber = runState.step_history.length + 1;

  while (runState.status === "running") {
    const step = findStep(workflow, runState.current_step);
    if (!step) {
      await pauseRun(
        config,
        runState,
        `Current step "${runState.current_step}" not found in workflow.`,
        runState.last_harness?.name ?? "claude",
        runState.last_harness?.session_id ?? null
      );
      return runState;
    }

    const agent = workflow.agents.find((item) => item.id === step.agent);
    if (!agent) {
      await pauseRun(
        config,
        runState,
        `Unknown agent "${step.agent}" for step "${step.id}".`,
        runState.last_harness?.name ?? "claude",
        runState.last_harness?.session_id ?? null
      );
      return runState;
    }

    const stepStartedAt = new Date().toISOString();

    try {
      assertRequiredInputs(step.input_required, runState.context);
      const resolvedInput = resolveTemplate(step.input, runState.context);
      const injectedHint =
        isFirstIteration && typeof options.overrides?.hint === "string"
          ? options.overrides.hint.trim()
          : "";
      const renderedInput = injectedHint
        ? `${resolvedInput}\n\nNote: ${injectedHint}`
        : resolvedInput;
      const agentPrompt = await loadAgentPrompt(runState.workflow_path, agent.prompt);
      const prompt = composePrompt(agentPrompt, renderedInput);

      const harness = options.overrides?.harness ?? agent.harness;
      const adapter = getHarnessAdapter(harness);
      const effectiveModel = options.overrides?.model ?? agent.model;
      const adapterOptions =
        typeof effectiveModel === "string"
          ? { allowAll: options.allowAll, model: effectiveModel }
          : { allowAll: options.allowAll };

      ui.stepStart(stepNumber, step.id, agent.id, harness, effectiveModel);

      // Only carry over session id when the harness hasn't changed.
      // A claude session id is meaningless to codex (and vice versa).
      const lastSessionMatchesHarness =
        runState.last_harness?.name === harness
          ? runState.last_harness.session_id
          : null;

      const selectedSessionId =
        isFirstIteration && options.overrides?.sessionId
          ? options.overrides.sessionId
          : lastSessionMatchesHarness;

      const command =
        isFirstIteration && selectedSessionId
          ? adapter.buildResumeCommand(selectedSessionId, prompt, {
              ...adapterOptions
            })
          : adapter.buildRunCommand(prompt, {
              ...adapterOptions
            });

      runState.last_harness = {
        name: harness,
        binary: command.binary,
        session_id: selectedSessionId ?? null
      };

      const result = await runHarnessCommand(command, adapter.createStreamParser());
      if (result.sessionId) {
        runState.last_harness.session_id = result.sessionId;
      }

      if (result.exitCode !== 0) {
        await pauseRun(
          config,
          runState,
          harnessExitReason({
            stepId: step.id,
            harness,
            exitCode: result.exitCode,
            stderr: result.stderr,
            combinedOutput: result.combinedOutput,
            ...(effectiveModel ? { model: effectiveModel } : {})
          }),
          harness,
          runState.last_harness.session_id
        );
        return runState;
      }

      if (result.combinedOutput.includes(HUMAN_SENTINEL)) {
        await pauseRun(
          config,
          runState,
          `HUMAN_INTERVENTION_REQUIRED at step "${step.id}".`,
          harness,
          runState.last_harness.session_id
        );
        return runState;
      }

      let stepOutput;
      try {
        stepOutput = parseRmrOutput(result.combinedOutput);
        validateRequiredOutputKeys(stepOutput, step.outputs.required);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse step output.";
        await pauseRun(
          config,
          runState,
          `${message} Raw output snippet: ${outputSnippet(result.combinedOutput)}`,
          harness,
          runState.last_harness.session_id
        );
        return runState;
      }

      ui.stepOutputs(stepOutput.values);
      applyOutputToContext(runState.context, step.id, stepOutput.values);

      const nextState = stepOutput.next_state ?? step.default_next;
      if (!isValidTarget(workflow, nextState)) {
        await pauseRun(
          config,
          runState,
          `Invalid next_state "${nextState}" at step "${step.id}".`,
          harness,
          runState.last_harness.session_id
        );
        return runState;
      }

      if (nextState === "human_intervention") {
        await pauseRun(
          config,
          runState,
          `Step "${step.id}" requested human intervention.`,
          harness,
          runState.last_harness.session_id
        );
        return runState;
      }

      // Record step execution in history
      const stepExecution: StepExecution = {
        step_number: stepNumber,
        step_id: step.id,
        agent_id: agent.id,
        session_id: runState.last_harness?.session_id ?? null,
        started_at: stepStartedAt,
        completed_at: new Date().toISOString()
      };
      runState.step_history.push(stepExecution);
      stepNumber++;

      ui.stepEnd();

      if (nextState === "done") {
        runState.status = "done";
        runState.current_step = "done";
        await saveRunState(config, runState);
        ui.success(`Run completed: ${runState.run_id}`);
        return runState;
      }

      runState.current_step = nextState;
      await saveRunState(config, runState);
      isFirstIteration = false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown execution error.";
      await pauseRun(
        config,
        runState,
        `${reason} (step "${step.id}")`,
        options.overrides?.harness ?? agent.harness,
        runState.last_harness?.session_id ?? null
      );
      return runState;
    }
  }

  return runState;
}
