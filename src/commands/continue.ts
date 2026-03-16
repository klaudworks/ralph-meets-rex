import { Command, Option } from "clipanion";

import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { logger } from "../lib/logger";
import { loadRunState } from "../lib/run-state";
import { runWorkflow } from "../lib/runner";
import type { ProviderName } from "../lib/types";
import { loadWorkflowDefinition } from "../lib/workflow-loader";

const PROVIDERS: ProviderName[] = ["claude", "claude-code", "opencode", "codex", "copilot"];

function parseProviderOverride(value: string | undefined): ProviderName | undefined {
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

export class ContinueCommand extends Command {
  public static paths = [["continue"]];

  public static usage = Command.Usage({
    category: "Workflow",
    description: "Resume a previously created run by run id.",
    details:
      "Loads `.rex/runs/<run-id>.json` and continues orchestration from the stored step unless overridden. If a provider session id exists (or is provided), Rex attempts provider resume first.",
    examples: [
      ["Resume a paused run", "$0 continue 20260316-153210Z"],
      ["Resume from a specific step", "$0 continue 20260316-153210Z --step verify"],
      [
        "Force provider/session override",
        "$0 continue 20260316-153210Z --provider claude --session-id abc123"
      ]
    ]
  });

  public readonly runId = Option.String({
    name: "run-id"
  });

  public readonly step = Option.String("--step", {
    required: false,
    description: "Override current step id before resuming."
  });

  public readonly provider = Option.String("--provider", {
    required: false,
    description: "Override provider for the resumed step."
  });

  public readonly sessionId = Option.String("--session-id", {
    required: false,
    description: "Force provider session id for resume attempt."
  });

  public async execute(): Promise<number> {
    const config = await loadConfig();
    const runState = await loadRunState(config, this.runId);
    const workflow = await loadWorkflowDefinition(runState.workflow_path);
    const providerOverride = parseProviderOverride(this.provider);

    runState.status = "running";
    if (this.step) {
      runState.current_step = this.step;
    }

    logger.header("Rex continue bootstrap");
    logger.info(`run-id: ${this.runId}`);
    logger.info(`status: ${runState.status}`);
    logger.info(`current-step: ${runState.current_step}`);
    logger.info(`step override: ${this.step ?? "(none)"}`);
    logger.info(`provider override: ${this.provider ?? "(none)"}`);
    logger.info(`session override: ${this.sessionId ?? "(none)"}`);
    logger.info(`workflow: ${runState.workflow_path}`);

    const overrides: {
      stepId?: string;
      provider?: ProviderName;
      sessionId?: string;
    } = {};

    if (this.step) {
      overrides.stepId = this.step;
    }
    if (providerOverride) {
      overrides.provider = providerOverride;
    }
    if (this.sessionId) {
      overrides.sessionId = this.sessionId;
    }

    await runWorkflow(config, workflow, runState, {
      allowAll: true,
      overrides
    });

    return 0;
  }
}
