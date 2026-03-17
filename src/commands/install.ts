import { cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, Option } from "clipanion";

import { BaseCommand } from "./base";
import { binaryName } from "../lib/binary-name";
import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { ui } from "../lib/ui";
import { getWorkflowDefaultHarness, workflowRequiresTask } from "../lib/workflow-utils";
import { loadWorkflowDefinition } from "../lib/workflow-loader";

function getExamplesWorkflowsDir(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));

  // When running from dist/index.js (npm install), examples/ is a sibling of dist/
  const fromDist = resolve(thisDir, "..", "examples", "workflows");
  // When running from src/ during development (bun run src/index.ts)
  const fromSrc = resolve(thisDir, "..", "..", "examples", "workflows");

  if (existsSync(fromDist)) return fromDist;
  if (existsSync(fromSrc)) return fromSrc;

  return fromSrc;
}

function resolveWorkflowFilePath(workflowDir: string): string {
  const yamlPath = resolve(workflowDir, "workflow.yaml");
  if (existsSync(yamlPath)) {
    return yamlPath;
  }

  const ymlPath = resolve(workflowDir, "workflow.yml");
  if (existsSync(ymlPath)) {
    return ymlPath;
  }

  throw new UserInputError(
    `Workflow directory does not contain workflow.yaml or workflow.yml: ${workflowDir}`
  );
}

export class InstallCommand extends BaseCommand {
  public static paths = [["install"]];

  public static usage = Command.Usage({
    category: "Setup",
    description: "Install a bundled workflow into .rmr/workflows/.",
    details:
      "Copies a workflow folder from bundled examples into `.rmr/workflows/<name>/`. Creates `.rmr/` and `.rmr/workflows/` if needed.",
    examples: [["Install feature-dev workflow", "$0 install feature-dev"]]
  });

  public readonly workflowName = Option.String({
    name: "workflow-name"
  });

  public async execute(): Promise<number> {
    const config = await loadConfig();
    const examplesDir = getExamplesWorkflowsDir();

    if (!existsSync(examplesDir)) {
      throw new UserInputError(`Bundled workflows directory not found: ${examplesDir}`);
    }

    const sourceDir = resolve(examplesDir, this.workflowName);
    const destinationDir = resolve(config.workflowsDir, this.workflowName);

    if (!existsSync(sourceDir)) {
      const available = (await readdir(examplesDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

      const hint = available.length > 0 ? ` Available: ${available.join(", ")}.` : " No bundled workflows found.";
      throw new UserInputError(`Unknown workflow \"${this.workflowName}\".${hint}`);
    }

    const sourceWorkflowPath = resolveWorkflowFilePath(sourceDir);
    const sourceWorkflow = await loadWorkflowDefinition(sourceWorkflowPath).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new UserInputError(`Bundled workflow \"${this.workflowName}\" is invalid: ${message}`);
    });
    const workflowFileName = basename(sourceWorkflowPath);
    const installedWorkflowPath = `.rmr/workflows/${this.workflowName}/${workflowFileName}`;
    const runHint = workflowRequiresTask(sourceWorkflow)
      ? `${binaryName} run ${installedWorkflowPath} --task "Describe your task"`
      : `${binaryName} run ${installedWorkflowPath}`;
    const defaultHarness = getWorkflowDefaultHarness(sourceWorkflow);
    const harnessHint =
      `Default harness: ${defaultHarness}. ` +
      `To use codex or opencode, edit ${installedWorkflowPath}.`;

    if (existsSync(destinationDir)) {
      ui.info(`Workflow already installed at .rmr/workflows/${this.workflowName}/`);
      ui.info(`Run it with: ${runHint}`);
      ui.info(harnessHint);
      return 0;
    }

    await cp(sourceDir, destinationDir, { recursive: true, force: false, errorOnExist: true });

    ui.success(`installed .rmr/workflows/${this.workflowName}/`);
    ui.info(`Run it with: ${runHint}`);
    ui.info(harnessHint);
    return 0;
  }
}
