import { Command, Option } from "clipanion";

import { BaseCommand } from "./base";
import { binaryName } from "../lib/binary-name";
import { loadConfig } from "../lib/config";
import { loadRunState } from "../lib/run-state";
import { runWorkflow } from "../lib/runner";
import { startUpdateCheck } from "../lib/update-check";
import { loadWorkflowDefinition } from "../lib/workflow-loader";
import { ui } from "../lib/ui";

export class ContinueCommand extends BaseCommand {
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
        "Force session override",
        "$0 continue 20260316-153210Z --session-id abc123"
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

  public readonly sessionId = Option.String("--session-id", {
    required: false,
    description: "Force harness session id for resume attempt."
  });

  public readonly hint = Option.String("--hint", {
    required: false,
    description: "Inject a one-time hint into the resumed harness prompt."
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

    runState.status = "running";
    if (this.step) {
      runState.current_step = this.step;
    }

    const effectiveAllowAll = this.noAllowAll ? false : this.allowAll;

    ui.workflowHeader({
      title: `${binaryName} continue`,
      workflow: runState.workflow_path,
      workflowId: workflow.id,
      task: runState.context["task"] ?? "(continuing)",
      runId: this.runId,
      runFile: "",
      allowAll: effectiveAllowAll,
      varsCount: 0
    });

    const overrides: {
      stepId?: string;
      sessionId?: string;
      hint?: string;
    } = {};

    if (this.step) {
      overrides.stepId = this.step;
    }
    if (this.sessionId) {
      overrides.sessionId = this.sessionId;
    }
    if (this.hint && this.hint.trim() !== "") {
      overrides.hint = this.hint;
    }

    await runWorkflow(config, workflow, runState, {
      allowAll: effectiveAllowAll,
      overrides
    });

    showUpdateNotice();
    return 0;
  }
}
