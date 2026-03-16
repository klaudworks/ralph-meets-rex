import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ConfigError } from "./errors";

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

export async function loadPromptFile(workflowPath: string, promptFileName: string): Promise<string> {
  const promptPath = resolve(dirname(workflowPath), promptFileName);

  try {
    const raw = await readFile(promptPath, "utf8");
    return stripFrontmatter(raw);
  } catch {
    throw new ConfigError(`Prompt file not found: ${promptPath}`);
  }
}

export function composePrompt(promptFile: string | undefined, promptInline: string | undefined): string {
  const parts: string[] = [];

  if (promptFile) {
    parts.push(promptFile.trimEnd());
  }

  if (promptInline) {
    parts.push(promptInline.trimEnd());
  }

  return parts.join("\n\n");
}
