import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { ensureScaffold } from "./scaffold";

export interface RexConfig {
  workspaceRoot: string;
  rexDir: string;
  runsDir: string;
  workflowsDir: string;
  agentsDir: string;
}

export async function loadConfig(workspaceRoot = process.cwd()): Promise<RexConfig> {
  const root = resolve(workspaceRoot);
  const rexDir = resolve(root, ".rex");

  const config: RexConfig = {
    workspaceRoot: root,
    rexDir,
    runsDir: resolve(rexDir, "runs"),
    workflowsDir: resolve(rexDir, "workflows"),
    agentsDir: resolve(rexDir, "agents")
  };

  await Promise.all([
    mkdir(config.rexDir, { recursive: true }),
    mkdir(config.runsDir, { recursive: true }),
    mkdir(config.workflowsDir, { recursive: true }),
    mkdir(config.agentsDir, { recursive: true })
  ]);

  await ensureScaffold(config);

  return config;
}
