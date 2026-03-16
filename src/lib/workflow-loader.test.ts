import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import { loadWorkflowDefinition } from "./workflow-loader";

const validWorkflow = `
id: quick-task
name: Quick Task
harness: claude
steps:
  - id: execute
    prompt: "Do {{task}}"
    next_step: done
    requires:
      inputs: [task]
      outputs: [result]
`;

describe("workflow-loader", () => {
  test("loads valid workflow", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(file, validWorkflow, "utf8");

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.id).toBe("quick-task");
    expect(workflow.steps[0]?.id).toBe("execute");
  });

  test("fails on duplicate step ids", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `${validWorkflow}\n  - id: execute\n    prompt: hi\n    next_step: done\n`,
      "utf8"
    );

    await expect(loadWorkflowDefinition(file)).rejects.toThrow("Duplicate step id");
  });

  test("top-level harness is used as default for steps", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: opencode\nsteps:\n  - id: execute\n    prompt: "Do {{task}}"\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.harness).toBe("opencode");
    expect(workflow.steps[0]?.harness).toBe("opencode");
  });

  test("step-level harness overrides top-level default", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nsteps:\n  - id: execute\n    harness: codex\n    prompt: "Do {{task}}"\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.harness).toBe("claude");
    expect(workflow.steps[0]?.harness).toBe("codex");
  });

  test("top-level model is used as default for steps", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nmodel: claude-sonnet\nsteps:\n  - id: execute\n    prompt: "Do {{task}}"\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.model).toBe("claude-sonnet");
    expect(workflow.steps[0]?.model).toBe("claude-sonnet");
  });

  test("step-level model overrides top-level model", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nmodel: claude-sonnet\nsteps:\n  - id: execute\n    model: claude-opus\n    prompt: "Do {{task}}"\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.steps[0]?.model).toBe("claude-opus");
  });

  test("fails when step has no harness and no top-level default", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nsteps:\n  - id: execute\n    prompt: "Do {{task}}"\n    next_step: done\n`,
      "utf8"
    );

    await expect(loadWorkflowDefinition(file)).rejects.toThrow(
      'Step "execute" has no harness and no top-level harness default is defined.'
    );
  });

  test("fails on unsupported top-level harness", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: bogus\nsteps:\n  - id: execute\n    prompt: "Do {{task}}"\n    next_step: done\n`,
      "utf8"
    );

    await expect(loadWorkflowDefinition(file)).rejects.toThrow('Unsupported top-level harness "bogus".');
  });

  test("fails when step has neither prompt nor prompt_file", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nsteps:\n  - id: execute\n    next_step: done\n`,
      "utf8"
    );

    await expect(loadWorkflowDefinition(file)).rejects.toThrow(
      'Step "execute" must define at least one of "prompt_file" or "prompt".'
    );
  });

  test("accepts prompt_file without prompt", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nsteps:\n  - id: execute\n    prompt_file: worker.md\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.steps[0]?.prompt_file).toBe("worker.md");
    expect(workflow.steps[0]?.prompt).toBeUndefined();
  });

  test("accepts both prompt_file and prompt", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nsteps:\n  - id: execute\n    prompt_file: worker.md\n    prompt: "Extra context"\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.steps[0]?.prompt_file).toBe("worker.md");
    expect(workflow.steps[0]?.prompt).toBe("Extra context");
  });

  test("requires block is optional and defaults to empty arrays", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "rmr-workflow-"));
    const file = resolve(dir, "workflow.yml");
    await writeFile(
      file,
      `id: test\nname: Test\nharness: claude\nsteps:\n  - id: execute\n    prompt: "Do it"\n    next_step: done\n`,
      "utf8"
    );

    const workflow = await loadWorkflowDefinition(file);
    expect(workflow.steps[0]?.requires.inputs).toEqual([]);
    expect(workflow.steps[0]?.requires.outputs).toEqual([]);
  });
});
