import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { RexConfig } from "./config";
import { ConfigError } from "./errors";

export async function loadAgentPrompt(config: RexConfig, promptFileName: string): Promise<string> {
  const promptPath = resolve(config.agentsDir, promptFileName);

  try {
    return await readFile(promptPath, "utf8");
  } catch {
    throw new ConfigError(`Agent prompt file not found: ${promptPath}`);
  }
}

export function composePrompt(agentPrompt: string, stepInput: string): string {
  return `${agentPrompt.trimEnd()}\n\n${stepInput.trim()}`;
}
