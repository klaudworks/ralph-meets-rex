import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface RmrConfig {
  workspaceRoot: string;
  rexDir: string;
  runsDir: string;
  workflowsDir: string;
}

export async function loadConfig(workspaceRoot = process.cwd()): Promise<RmrConfig> {
  const root = resolve(workspaceRoot);
  const rexDir = resolve(root, ".rmr");

  const config: RmrConfig = {
    workspaceRoot: root,
    rexDir,
    runsDir: resolve(rexDir, "runs"),
    workflowsDir: resolve(rexDir, "workflows")
  };

  await Promise.all([
    mkdir(config.rexDir, { recursive: true }),
    mkdir(config.runsDir, { recursive: true }),
    mkdir(config.workflowsDir, { recursive: true })
  ]);

  return config;
}
