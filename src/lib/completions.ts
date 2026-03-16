import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { RexConfig } from "./config";

function matchesPartial(value: string, partial: string): boolean {
  if (!partial) {
    return true;
  }

  return value.startsWith(partial);
}

export async function listRunIdCompletions(
  config: RexConfig,
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
  config: RexConfig,
  partial = ""
): Promise<string[]> {
  const entries = await readdir(config.workflowsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")))
    .map((entry) => resolve(config.workflowsDir, entry.name))
    .filter((filePath) => matchesPartial(filePath, partial))
    .sort();
}
