import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { RmrConfig } from "./config";

function matchesPartial(value: string, partial: string): boolean {
  if (!partial) {
    return true;
  }

  return value.startsWith(partial);
}

export async function listRunIdCompletions(
  config: RmrConfig,
  partial = ""
): Promise<string[]> {
  const entries = await readdir(config.runsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .filter((id) => matchesPartial(id, partial))
    .sort();
}

export async function listWorkflowCompletions(
  config: RmrConfig,
  partial = ""
): Promise<string[]> {
  const entries = await readdir(config.workflowsDir, { withFileTypes: true });
  const workflows: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const workflowYaml = resolve(config.workflowsDir, entry.name, "workflow.yaml");
    const workflowYml = resolve(config.workflowsDir, entry.name, "workflow.yml");

    try {
      await access(workflowYaml);
      workflows.push(workflowYaml);
      continue;
    } catch {
      // Try .yml fallback
    }

    try {
      await access(workflowYml);
      workflows.push(workflowYml);
    } catch {
      // Ignore directories without a workflow file
    }
  }

  return workflows.filter((filePath) => matchesPartial(filePath, partial)).sort();
}
