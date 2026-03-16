import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import { loadWorkflowDefinition } from "./workflow-loader";

const validWorkflow = `
id: quick-task
name: Quick Task
agents:
  - id: worker
    provider: claude
    prompt: worker.md
steps:
  - id: execute
    agent: worker
    default_next: done
    input_required: [task]
    outputs:
      required: [result]
    input: |
      Do {{task}}
`;

describe("workflow-loader", () => {
  test("loads valid workflow", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rex-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(file, validWorkflow, "utf8");

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.id).toBe("quick-task");
    expect(workflow.steps[0]?.id).toBe("execute");
  });

  test("fails on duplicate step ids", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rex-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `${validWorkflow}\n  - id: execute\n    agent: worker\n    default_next: done\n    input_required: [task]\n    outputs:\n      required: []\n    input: hi\n`,
      "utf8"
    );

    await expect(loadWorkflowDefinition(file)).rejects.toThrow("Duplicate step id");
  });
});
