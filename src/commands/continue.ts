import { Command, Option } from "clipanion";

import { loadConfig } from "../lib/config";
import { loadRunState } from "../lib/run-state";
import { runWorkflow } from "../lib/runner";
import { parseHarnessOverride, type HarnessName } from "../lib/types";
import { startUpdateCheck } from "../lib/update-check";
import { loadWorkflowDefinition } from "../lib/workflow-loader";
import { ui } from "../lib/ui";

export class ContinueCommand extends Command {
  public static paths = [["continue"]];

  public static usage = Command.Usage({
    category: "Workflow",
    description: "Resume a previously created run by run id.",
    details:
      "Loads `.rmr/runs/<run-id>.json` and continues orchestration from the stored step unless overridden. If a harness session id exists (or is provided), rmr attempts harness resume first.",
    examples: [
      ["Resume a paused run", "$0 continue 20260316-153210Z"],
      ["Resume from a specific step", "$0 continue 20260316-153210Z --step verify"],
      [
        "Resume with a hint",
        "$0 continue 20260316-153210Z --hint \"Plan mode only: read and propose changes, do not edit files.\""
      ],
      [
        "Force harness/session override",
        "$0 continue 20260316-153210Z --harness claude --session-id abc123"
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

  public readonly harness = Option.String("--harness", {
    required: false,
    description: "Override harness for the resumed step."
  });

  public readonly sessionId = Option.String("--session-id", {
    required: false,
    description: "Force harness session id for resume attempt."
  });

  public readonly hint = Option.String("--hint", {
    required: false,
    description: "Inject a one-time hint into the resumed harness prompt."
  });

  public readonly model = Option.String("--model", {
    required: false,
    description: "Override model for the resumed step (e.g., openai/gpt-5.3-codex-high)."
  });

  public readonly allowAll = Option.Boolean("--allow-all", true, {
    description: "Enable harness auto-approval flags when supported (default: true)."
  });

  public readonly noAllowAll = Option.Boolean("--no-allow-all", false, {
    description: "Disable harness auto-approval flags."
  });

  public async execute(): Promise<number> {
    const showUpdateNotice = startUpdateCheck();
    const config = await loadConfig();
    const runState = await loadRunState(config, this.runId);
    const workflow = await loadWorkflowDefinition(runState.workflow_path);
    const harnessOverride = parseHarnessOverride(this.harness);

    runState.status = "running";
    if (this.step) {
      runState.current_step = this.step;
    }

    const effectiveAllowAll = this.noAllowAll ? false : this.allowAll;

    ui.workflowHeader({
      title: "rmr continue",
      workflow: runState.workflow_path,
      workflowId: workflow.id,
      task: runState.context["task"] ?? "(continuing)",
      runId: this.runId,
      currentStep: runState.current_step,
      runFile: "",
      allowAll: effectiveAllowAll,
      harness: this.harness,
      model: this.model,
      varsCount: 0
    });

    const overrides: {
      stepId?: string;
      harness?: HarnessName;
      sessionId?: string;
      hint?: string;
      model?: string;
    } = {};

    if (this.step) {
      overrides.stepId = this.step;
    }
    if (harnessOverride) {
      overrides.harness = harnessOverride;
    }
    if (this.sessionId) {
      overrides.sessionId = this.sessionId;
    }
    if (this.hint && this.hint.trim() !== "") {
      overrides.hint = this.hint;
    }
    if (this.model) {
      overrides.model = this.model;
    }

    await runWorkflow(config, workflow, runState, {
      allowAll: effectiveAllowAll,
      overrides
    });

    showUpdateNotice();
    return 0;
  }
}
