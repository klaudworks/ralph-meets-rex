import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "clipanion";
import { BaseCommand } from "./base";
import { loadConfig } from "../lib/config";
import { loadWorkflowDefinition } from "../lib/workflow-loader";
import { ui } from "../lib/ui";

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

interface WorkflowInfo {
  id: string;
  name: string;
  path: string;
}

async function getInstalledWorkflows(workflowsDir: string): Promise<WorkflowInfo[]> {
  if (!existsSync(workflowsDir)) {
    return [];
  }

  const entries = await readdir(workflowsDir, { withFileTypes: true });
  const workflows: WorkflowInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const workflowPath = resolve(workflowsDir, entry.name, "workflow.yaml");
    if (!existsSync(workflowPath)) continue;

    try {
      const workflow = await loadWorkflowDefinition(workflowPath);
      workflows.push({
        id: workflow.id,
        name: workflow.name,
        path: `.rmr/workflows/${entry.name}/workflow.yaml`
      });
    } catch {
      // Invalid workflow.yaml - still show it but with limited info
      workflows.push({
        id: entry.name,
        name: "(invalid workflow.yaml)",
        path: `.rmr/workflows/${entry.name}/workflow.yaml`
      });
    }
  }

  return workflows.sort((a, b) => a.id.localeCompare(b.id));
}

async function getBundledWorkflows(examplesDir: string): Promise<WorkflowInfo[]> {
  if (!existsSync(examplesDir)) {
    return [];
  }

  const entries = await readdir(examplesDir, { withFileTypes: true });
  const workflows: WorkflowInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const workflowPath = resolve(examplesDir, entry.name, "workflow.yaml");
    if (!existsSync(workflowPath)) continue;

    try {
      const workflow = await loadWorkflowDefinition(workflowPath);
      workflows.push({
        id: workflow.id,
        name: workflow.name,
        path: entry.name
      });
    } catch {
      // Invalid workflow.yaml - still show it but with limited info
      workflows.push({
        id: entry.name,
        name: "(invalid workflow.yaml)",
        path: entry.name
      });
    }
  }

  return workflows.sort((a, b) => a.id.localeCompare(b.id));
}

export class ListCommand extends BaseCommand {
  public static paths = [["list"]];

  public static usage = Command.Usage({
    category: "Setup",
    description: "List installed and available workflows.",
    details:
      "Shows workflows installed in `.rmr/workflows/` and bundled workflows available for installation.",
    examples: [["List all workflows", "$0 list"]]
  });

  public async execute(): Promise<number> {
    const config = await loadConfig();
    const examplesDir = getExamplesWorkflowsDir();

    const installed = await getInstalledWorkflows(config.workflowsDir);
    const bundled = await getBundledWorkflows(examplesDir);
    const installedIds = new Set(installed.map((w) => w.id));

    if (installed.length > 0) {
      ui.info("Installed workflows:");
      for (const workflow of installed) {
        ui.info(`  ${workflow.id.padEnd(16)} ${workflow.name.padEnd(24)} ${workflow.path}`);
      }
      ui.info("");
    }

    const available = bundled.filter((w) => !installedIds.has(w.id));
    if (available.length > 0) {
      ui.info("Available to install:");
      for (const workflow of available) {
        ui.info(`  ${workflow.id.padEnd(16)} rmr install ${workflow.path}`);
      }
      ui.info("");
    }

    if (installed.length === 0 && bundled.length > 0) {
      ui.info("No workflows installed yet. Install one with:");
      ui.info(`  rmr install ${bundled[0]?.path}`);
      ui.info("");
    }

    if (installed.length === 0 && bundled.length === 0) {
      ui.info("No workflows found.");
    }

    return 0;
  }
}
