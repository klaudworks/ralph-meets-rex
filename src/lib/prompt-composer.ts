import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { RexConfig } from "./config";
import { ConfigError } from "./errors";

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

export async function loadAgentPrompt(config: RexConfig, promptFileName: string): Promise<string> {
  const promptPath = resolve(config.agentsDir, promptFileName);

  try {
    const raw = await readFile(promptPath, "utf8");
    return stripFrontmatter(raw);
  } catch {
    throw new ConfigError(`Agent prompt file not found: ${promptPath}`);
  }
}

export function composePrompt(agentPrompt: string, stepInput: string): string {
  return `${agentPrompt.trimEnd()}\n\n${stepInput.trim()}`;
}
