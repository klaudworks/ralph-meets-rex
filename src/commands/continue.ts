import { Command, Option } from "clipanion";

import { loadConfig } from "../lib/config";
import { loadRunState } from "../lib/run-state";
import { runWorkflow } from "../lib/runner";
import { parseProviderOverride, type ProviderName } from "../lib/types";
import { loadWorkflowDefinition } from "../lib/workflow-loader";
import { ui } from "../lib/ui";

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

    ui.workflowHeader({
      title: "rex continue",
      workflow: runState.workflow_path,
      workflowId: workflow.id,
      task: runState.context["task"] ?? "(continuing)",
      runId: this.runId,
      currentStep: runState.current_step,
      runFile: "",
      allowAll: true,
      provider: this.provider,
      varsCount: 0
    });

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
