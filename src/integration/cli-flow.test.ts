import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "bun:test";

const indexPath = resolve(import.meta.dir, "../index.ts");

async function runCli(args: string[], cwd: string, env: Record<string, string>) {
  const proc = Bun.spawn({
    cmd: ["bun", "run", indexPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  return { stdout, stderr, exitCode };
}

function parseRunId(output: string): string {
  const match = output.match(/run-id:\s+([0-9]{8}-[0-9]{6}Z)/);
  if (!match?.[1]) {
    throw new Error(`run-id not found in output: ${output}`);
  }

  return match[1];
}

describe("cli integration", () => {
  test("run reaches done and writes done state", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rex-cli-"));
    const rexAgents = resolve(root, ".rex", "agents");
    const fakeBinDir = resolve(root, "fake-bin");

    await mkdir(rexAgents, { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });

    await writeFile(resolve(rexAgents, "worker.md"), "You are worker", "utf8");

    const workflowPath = resolve(root, "workflow.yml");
    await writeFile(
      workflowPath,
      `id: quick-task\nname: Quick Task\nagents:\n  - id: worker\n    provider: claude\n    prompt: worker.md\nsteps:\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: [result]\n    input: |\n      Do {{task}}\n`,
      "utf8"
    );

    const fakeClaude = resolve(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      "#!/bin/sh\nprintf '<rex_output><status>done</status><next_state>done</next_state><result>ok</result></rex_output>\\n'\n",
      "utf8"
    );
    await chmod(fakeClaude, 0o755);

    const result = await runCli(["run", workflowPath, "ship it"], root, {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Run completed");

    const runId = parseRunId(result.stdout);
    const runFile = resolve(root, ".rex", "runs", `${runId}.json`);
    const persisted = JSON.parse(await readFile(runFile, "utf8")) as {
      status: string;
      current_step: string;
      context: Record<string, string>;
    };

    expect(persisted.status).toBe("done");
    expect(persisted.current_step).toBe("done");
    expect(persisted.context["execute.result"]).toBe("ok");
  });

  test("run pauses and continue resumes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rex-cli-"));
    const rexAgents = resolve(root, ".rex", "agents");
    const fakeBinDir = resolve(root, "fake-bin");

    await mkdir(rexAgents, { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });

    await writeFile(resolve(rexAgents, "worker.md"), "You are worker", "utf8");

    const workflowPath = resolve(root, "workflow.yml");
    await writeFile(
      workflowPath,
      `id: quick-task\nname: Quick Task\nagents:\n  - id: worker\n    provider: claude\n    prompt: worker.md\nsteps:\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: [result]\n    input: |\n      Do {{task}}\n`,
      "utf8"
    );

    const fakeClaude = resolve(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      "#!/bin/sh\nif [ \"$CLAUDE_MODE\" = \"pause\" ]; then\n  printf '<rex_output><status>human_intervention_required</status><next_state>human_intervention</next_state><result>pending</result></rex_output>\\nHUMAN_INTERVENTION_REQUIRED\\n'\nelse\n  printf '<rex_output><status>done</status><next_state>done</next_state><result>ok</result></rex_output>\\n'\nfi\n",
      "utf8"
    );
    await chmod(fakeClaude, 0o755);

    const paused = await runCli(["run", workflowPath, "ship it"], root, {
      ...process.env,
      CLAUDE_MODE: "pause",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(paused.exitCode).toBe(0);
    expect(paused.stderr).toContain("Paused: HUMAN_INTERVENTION_REQUIRED");
    const runId = parseRunId(paused.stdout);

    const resumed = await runCli(["continue", runId], root, {
      ...process.env,
      CLAUDE_MODE: "done",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(resumed.exitCode).toBe(0);
    expect(resumed.stdout).toContain("Run completed");
  });
});
