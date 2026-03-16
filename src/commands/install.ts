import { cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, Option } from "clipanion";

import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { ui } from "../lib/ui";

function getExamplesWorkflowsDir(): string {
  const thisFile = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  const fromDist = resolve(thisDir, "..", "examples", "workflows");
  const fromSrc = resolve(thisDir, "..", "..", "examples", "workflows");

  if (existsSync(fromDist)) return fromDist;
  if (existsSync(fromSrc)) return fromSrc;

  return fromSrc;
}

export class InstallCommand extends Command {
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

    if (existsSync(destinationDir)) {
      throw new UserInputError(`Workflow already installed at ${destinationDir}.`);
    }

    await cp(sourceDir, destinationDir, { recursive: true, force: false, errorOnExist: true });

    ui.success(`installed .rmr/workflows/${this.workflowName}/`);
    ui.info(`Run it with: rmr run .rmr/workflows/${this.workflowName}/workflow.yaml --task \"Describe your task\"`);
    return 0;
  }
}
