import type { RexConfig } from "./config";
import { logger } from "./logger";
import { loadAgentPrompt, composePrompt } from "./prompt-composer";
import { getProviderAdapter } from "./provider-adapters";
import { runProviderCommand } from "./process-runner";
import { parseRexOutput, validateRequiredOutputKeys } from "./rex-output-parser";
import { saveRunState } from "./run-state";
import { assertRequiredInputs, resolveTemplate } from "./templating";
import type { ProviderName, RunState, WorkflowDefinition, WorkflowStep } from "./types";

const HUMAN_SENTINEL = "HUMAN_INTERVENTION_REQUIRED";

interface ContinueOverrides {
  stepId?: string;
  provider?: ProviderName;
  sessionId?: string;
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

async function pauseRun(
  config: RexConfig,
  runState: RunState,
  reason: string,
  providerName: ProviderName,
  sessionId: string | null
): Promise<void> {
  runState.status = "paused_human";
  await saveRunState(config, runState);

  const adapter = getProviderAdapter(providerName);
  const resolvedSession = sessionId ?? "<session-id>";

  logger.warn(`Paused: ${reason}`);
  logger.info("");
  logger.info("Resume workflow:");
  logger.info(`  rex continue ${runState.run_id}`);
  logger.info("");
  logger.info("Resume agent session directly:");
  logger.info(`  ${adapter.resumeTemplate(resolvedSession)}`);
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
  config: RexConfig,
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

  while (runState.status === "running") {
    const step = findStep(workflow, runState.current_step);
    if (!step) {
      await pauseRun(
        config,
        runState,
        `Current step "${runState.current_step}" not found in workflow.`,
        runState.last_provider?.name ?? "claude",
        runState.last_provider?.session_id ?? null
      );
      return runState;
    }

    const agent = workflow.agents.find((item) => item.id === step.agent);
    if (!agent) {
      await pauseRun(
        config,
        runState,
        `Unknown agent "${step.agent}" for step "${step.id}".`,
        runState.last_provider?.name ?? "claude",
        runState.last_provider?.session_id ?? null
      );
      return runState;
    }

    logger.header(`=== Step: ${step.id} (${agent.id}) ===`);

    try {
      assertRequiredInputs(step.input_required, runState.context);
      const renderedInput = resolveTemplate(step.input, runState.context);
      const agentPrompt = await loadAgentPrompt(config, agent.prompt);
      const prompt = composePrompt(agentPrompt, renderedInput);

      const provider = options.overrides?.provider ?? agent.provider;
      const adapter = getProviderAdapter(provider);
      const adapterOptions =
        typeof agent.model === "string"
          ? { allowAll: options.allowAll, model: agent.model }
          : { allowAll: options.allowAll };

      const selectedSessionId =
        isFirstIteration && options.overrides?.sessionId
          ? options.overrides.sessionId
          : runState.last_provider?.session_id;

      const command =
        isFirstIteration && selectedSessionId
          ? adapter.buildResumeCommand(selectedSessionId, prompt, {
              ...adapterOptions
            })
          : adapter.buildRunCommand(prompt, {
              ...adapterOptions
            });

      runState.last_provider = {
        name: provider,
        binary: command.binary,
        session_id: selectedSessionId ?? null
      };

      const result = await runProviderCommand(command);
      const parsedSessionId = adapter.parseSessionId(result.combinedOutput);
      if (parsedSessionId) {
        runState.last_provider.session_id = parsedSessionId;
      }

      if (result.exitCode !== 0) {
        await pauseRun(
          config,
          runState,
          `Provider exited with code ${result.exitCode} at step "${step.id}".`,
          provider,
          runState.last_provider.session_id
        );
        return runState;
      }

      if (result.combinedOutput.includes(HUMAN_SENTINEL)) {
        await pauseRun(
          config,
          runState,
          `HUMAN_INTERVENTION_REQUIRED at step "${step.id}".`,
          provider,
          runState.last_provider.session_id
        );
        return runState;
      }

      let stepOutput;
      try {
        stepOutput = parseRexOutput(result.combinedOutput);
        validateRequiredOutputKeys(stepOutput, step.outputs.required);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse step output.";
        await pauseRun(
          config,
          runState,
          `${message} Raw output snippet: ${outputSnippet(result.combinedOutput)}`,
          provider,
          runState.last_provider.session_id
        );
        return runState;
      }

      applyOutputToContext(runState.context, step.id, stepOutput.values);

      const nextState = stepOutput.next_state ?? step.default_next;
      if (!isValidTarget(workflow, nextState)) {
        await pauseRun(
          config,
          runState,
          `Invalid next_state "${nextState}" at step "${step.id}".`,
          provider,
          runState.last_provider.session_id
        );
        return runState;
      }

      if (nextState === "human_intervention") {
        await pauseRun(
          config,
          runState,
          `Step "${step.id}" requested human intervention.`,
          provider,
          runState.last_provider.session_id
        );
        return runState;
      }

      if (nextState === "done") {
        runState.status = "done";
        runState.current_step = "done";
        await saveRunState(config, runState);
        logger.success(`Run completed: ${runState.run_id}`);
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
        options.overrides?.provider ?? agent.provider,
        runState.last_provider?.session_id ?? null
      );
      return runState;
    }
  }

  return runState;
}
