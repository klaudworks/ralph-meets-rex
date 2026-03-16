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
  test("run shows friendly error when workflow does not exist", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));

    const result = await runCli(["run", ".rmr/workflows/feature-dev/workflow.yaml", "--task", "ship it"], root, {
      ...process.env
    } as Record<string, string>);

    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain("Workflow does not exist");
    expect(output).not.toContain("non-error rejection");
    expect(output).not.toMatch(/\n\s+at\s+/);
  });

  test("run accepts a workflow directory path", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));
    const fakeBinDir = resolve(root, "fake-bin");
    const workflowDir = resolve(root, ".rmr", "workflows", "quick-task");

    await mkdir(workflowDir, { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });
    await writeFile(resolve(workflowDir, "worker.md"), "You are worker", "utf8");
    await writeFile(
      resolve(workflowDir, "workflow.yaml"),
      `id: quick-task\nname: Quick Task\nagents:\n  - id: worker\n    harness: claude\n    prompt: worker.md\nsteps:\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: [result]\n    input: |\n      Do {{task}}\n`,
      "utf8"
    );

    const fakeClaude = resolve(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"fake-session-1"}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<rmr:status>done</rmr:status><rmr:next_state>done</rmr:next_state><rmr:result>ok</rmr:result>"}},"session_id":"fake-session-1"}'
echo '{"type":"result","subtype":"success","session_id":"fake-session-1","result":"ok"}'
`,
      "utf8"
    );
    await chmod(fakeClaude, 0o755);

    const result = await runCli(["run", workflowDir, "--task", "ship it"], root, {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Run completed");
    expect(result.stdout).toContain("harness:");
    expect(result.stdout).toContain("model:");
  });

  test("install copies bundled workflow into .rmr/workflows", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));

    const result = await runCli(["install", "feature-dev"], root, {
      ...process.env
    } as Record<string, string>);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("installed .rmr/workflows/feature-dev/");

    const installedWorkflow = await readFile(
      resolve(root, ".rmr", "workflows", "feature-dev", "workflow.yaml"),
      "utf8"
    );
    expect(installedWorkflow).toContain("id: feature-dev");
  });

  test("run reaches done and writes done state", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));
    const fakeBinDir = resolve(root, "fake-bin");

    await mkdir(resolve(root, ".rmr", "workflows"), { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });

    const workflowPath = resolve(root, "workflow.yml");
    await writeFile(resolve(root, "worker.md"), "You are worker", "utf8");
    await writeFile(
      workflowPath,
      `id: quick-task\nname: Quick Task\nagents:\n  - id: worker\n    harness: claude\n    prompt: worker.md\nsteps:\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: [result]\n    input: |\n      Do {{task}}\n`,
      "utf8"
    );

    const fakeClaude = resolve(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"fake-session-1"}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<rmr:status>done</rmr:status><rmr:next_state>done</rmr:next_state><rmr:result>ok</rmr:result>"}},"session_id":"fake-session-1"}'
echo '{"type":"result","subtype":"success","session_id":"fake-session-1","result":"ok"}'
`,
      "utf8"
    );
    await chmod(fakeClaude, 0o755);

    const result = await runCli(["run", workflowPath, "--task", "ship it"], root, {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Run completed");

    const runId = parseRunId(result.stdout);
    const runFile = resolve(root, ".rmr", "runs", `${runId}.json`);
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
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));
    const fakeBinDir = resolve(root, "fake-bin");

    await mkdir(resolve(root, ".rmr", "workflows"), { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });

    const workflowPath = resolve(root, "workflow.yml");
    await writeFile(resolve(root, "worker.md"), "You are worker", "utf8");
    await writeFile(
      workflowPath,
      `id: quick-task\nname: Quick Task\nagents:\n  - id: worker\n    harness: claude\n    prompt: worker.md\nsteps:\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: [result]\n    input: |\n      Do {{task}}\n`,
      "utf8"
    );

    const fakeClaude = resolve(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/sh
if [ "$CLAUDE_MODE" = "pause" ]; then
  echo '{"type":"system","subtype":"init","session_id":"fake-session-1"}'
  echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<rmr:status>human_intervention_required</rmr:status><rmr:next_state>human_intervention</rmr:next_state><rmr:result>pending</rmr:result>"}},"session_id":"fake-session-1"}'
  echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\nHUMAN_INTERVENTION_REQUIRED\n"}},"session_id":"fake-session-1"}'
  echo '{"type":"result","subtype":"success","session_id":"fake-session-1","result":"ok"}'
else
  echo '{"type":"system","subtype":"init","session_id":"fake-session-2"}'
  echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<rmr:status>done</rmr:status><rmr:next_state>done</rmr:next_state><rmr:result>ok</rmr:result>"}},"session_id":"fake-session-2"}'
  echo '{"type":"result","subtype":"success","session_id":"fake-session-2","result":"ok"}'
fi
`,
      "utf8"
    );
    await chmod(fakeClaude, 0o755);

    const paused = await runCli(["run", workflowPath, "--task", "ship it"], root, {
      ...process.env,
      CLAUDE_MODE: "pause",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(paused.exitCode).toBe(0);
    expect(paused.stderr).toContain("Paused:");
    const runId = parseRunId(paused.stdout);

    const resumed = await runCli(["continue", runId], root, {
      ...process.env,
      CLAUDE_MODE: "done",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(resumed.exitCode).toBe(0);
    expect(resumed.stdout).toContain("Run completed");
    expect(resumed.stdout).toContain("harness:");
    expect(resumed.stdout).toContain("model:");
  }, 15000);

  test("run includes harness failure details when harness exits non-zero", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));
    const fakeBinDir = resolve(root, "fake-bin");

    await mkdir(resolve(root, ".rmr", "workflows"), { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });

    const workflowPath = resolve(root, "workflow.yml");
    await writeFile(resolve(root, "worker.md"), "You are worker", "utf8");
    await writeFile(
      workflowPath,
      `id: quick-task\nname: Quick Task\nagents:\n  - id: worker\n    harness: claude\n    model: claude-test\n    prompt: worker.md\nsteps:\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: [result]\n    input: |\n      Do {{task}}\n`,
      "utf8"
    );

    const fakeClaude = resolve(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/sh
echo 'fatal: auth failed' 1>&2
exit 1
`,
      "utf8"
    );
    await chmod(fakeClaude, 0o755);

    const result = await runCli(["run", workflowPath, "--task", "ship it"], root, {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Paused:");
    expect(result.stderr).toContain("Harness exited with code 1");
    expect(result.stderr).toContain("harness=claude");
    expect(result.stderr).toContain("model=claude-test");
    expect(result.stderr).toContain("stderr=fatal: auth failed");
  });

  test("continue uses current step harness and does not reuse prior harness session", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "rmr-cli-"));
    const fakeBinDir = resolve(root, "fake-bin");

    await mkdir(resolve(root, ".rmr", "runs"), { recursive: true });
    await mkdir(fakeBinDir, { recursive: true });

    const workflowPath = resolve(root, "workflow.yml");
    await writeFile(resolve(root, "planner.md"), "You are planner", "utf8");
    await writeFile(resolve(root, "developer.md"), "You are developer", "utf8");
    await writeFile(
      workflowPath,
      `id: quick-task\nname: Quick Task\nagents:\n  - id: planner\n    harness: claude\n    prompt: planner.md\n  - id: developer\n    harness: codex\n    model: gpt-5.3-codex\n    prompt: developer.md\nsteps:\n  - id: plan\n    agent: planner\n    default_next: implement\n    input_required: [task]\n    outputs:\n      required: []\n    input: |\n      Plan {{task}}\n  - id: implement\n    agent: developer\n    default_next: done\n    input_required: [task, plan.plan]\n    outputs:\n      required: [result]\n    input: |\n      Implement {{task}} using {{plan.plan}}\n`,
      "utf8"
    );

    const runId = "20260317-010203Z";
    await writeFile(
      resolve(root, ".rmr", "runs", `${runId}.json`),
      JSON.stringify(
        {
          run_id: runId,
          workflow_path: workflowPath,
          status: "paused_human",
          current_step: "implement",
          context: {
            task: "ship it",
            "plan.plan": "build feature"
          },
          last_harness: {
            name: "claude",
            binary: "claude",
            session_id: "claude-session-1"
          },
          step_history: [
            {
              step_number: 1,
              step_id: "plan",
              agent_id: "planner",
              session_id: "claude-session-1",
              started_at: "2026-03-17T01:00:00.000Z",
              completed_at: "2026-03-17T01:00:01.000Z"
            }
          ],
          updated_at: "2026-03-17T01:00:01.000Z"
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const fakeCodex = resolve(fakeBinDir, "codex");
    await writeFile(
      fakeCodex,
      `#!/bin/sh
if [ "$2" = "resume" ]; then
  echo 'unexpected resume path for codex' 1>&2
  exit 9
fi
echo '{"type":"thread.started","thread_id":"codex-thread-1"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"<rmr:status>done</rmr:status><rmr:next_state>done</rmr:next_state><rmr:result>ok</rmr:result>"}}'
`,
      "utf8"
    );
    await chmod(fakeCodex, 0o755);

    const result = await runCli(["continue", runId], root, {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    } as Record<string, string>);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Run completed");
    expect(result.stdout).toContain("harness:  codex");
    expect(result.stdout).toContain("model:    gpt-5.3-codex");
    expect(result.stderr).not.toContain("unexpected resume path for codex");
  });
});
