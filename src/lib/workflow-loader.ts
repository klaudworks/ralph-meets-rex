import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";

import { ValidationError } from "./errors";
import type { HarnessName, WorkflowDefinition } from "./types";

const SUPPORTED_HARNESSES = new Set<HarnessName>([
  "claude",
  "opencode",
  "codex",
  "copilot"
]);

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`Invalid workflow field "${field}": expected non-empty string.`);
  }

  return value;
}

function ensureStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`Invalid workflow field "${field}": expected string array.`);
  }

  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ValidationError(`Invalid workflow field "${field}": all entries must be non-empty strings.`);
    }
  }

  return value;
}

function validateUniqueness(items: string[], kind: string): void {
  const seen = new Set<string>();
  for (const id of items) {
    if (seen.has(id)) {
      throw new ValidationError(`Duplicate ${kind} id "${id}".`);
    }
    seen.add(id);
  }
}

export async function loadWorkflowDefinition(workflowPath: string): Promise<WorkflowDefinition> {
  const absolutePath = resolve(workflowPath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = parse(raw) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new ValidationError("Workflow file is empty or invalid YAML.");
  }

  const id = ensureString(parsed.id, "id");
  const name = ensureString(parsed.name, "name");
  const version = typeof parsed.version === "string" ? parsed.version : undefined;

  // Parse optional top-level harness and model defaults
  let topLevelHarness: HarnessName | undefined;
  if (typeof parsed.harness === "string" && parsed.harness.trim() !== "") {
    const h = parsed.harness.trim() as HarnessName;
    if (!SUPPORTED_HARNESSES.has(h)) {
      throw new ValidationError(`Unsupported top-level harness "${h}".`);
    }
    topLevelHarness = h;
  }
  const topLevelModel = typeof parsed.model === "string" && parsed.model.trim() !== ""
    ? parsed.model.trim()
    : undefined;

  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new ValidationError("Workflow must define a non-empty steps array.");
  }

  const steps = parsed.steps.map((rawStep, index) => {
    if (!rawStep || typeof rawStep !== "object") {
      throw new ValidationError(`Invalid steps[${index}] definition.`);
    }

    const step = rawStep as Record<string, unknown>;
    const stepId = ensureString(step.id, `steps[${index}].id`);

    // Step-level harness is optional when a top-level default exists
    let harness: HarnessName;
    if (typeof step.harness === "string" && step.harness.trim() !== "") {
      harness = step.harness.trim() as HarnessName;
      if (!SUPPORTED_HARNESSES.has(harness)) {
        throw new ValidationError(`Unsupported harness "${harness}" for step "${stepId}".`);
      }
    } else if (topLevelHarness) {
      harness = topLevelHarness;
    } else {
      throw new ValidationError(
        `Step "${stepId}" has no harness and no top-level harness default is defined.`
      );
    }

    // Step-level model falls back to top-level model
    const stepModel = step.model;
    const effectiveModel =
      typeof stepModel === "string" && stepModel.trim() !== ""
        ? stepModel
        : topLevelModel;

    // Parse prompt_file and prompt (at least one must be present)
    const hasPromptFile = typeof step.prompt_file === "string" && step.prompt_file.trim() !== "";
    const hasPrompt = typeof step.prompt === "string" && step.prompt.trim() !== "";

    if (!hasPromptFile && !hasPrompt) {
      throw new ValidationError(
        `Step "${stepId}" must define at least one of "prompt_file" or "prompt".`
      );
    }

    // Parse requires block
    const requires = step.requires as Record<string, unknown> | undefined;
    const requiresInputs = requires && Array.isArray(requires.inputs)
      ? ensureStringArray(requires.inputs, `steps[${index}].requires.inputs`)
      : [];
    const requiresOutputs = requires && Array.isArray(requires.outputs)
      ? ensureStringArray(requires.outputs, `steps[${index}].requires.outputs`)
      : [];

    const normalized: {
      id: string;
      prompt_file?: string;
      prompt?: string;
      harness: HarnessName;
      model?: string;
      next_step: string;
      requires: { inputs: string[]; outputs: string[] };
    } = {
      id: stepId,
      harness,
      next_step: ensureString(step.next_step, `steps[${index}].next_step`),
      requires: {
        inputs: requiresInputs,
        outputs: requiresOutputs
      }
    };

    if (hasPromptFile) {
      normalized.prompt_file = (step.prompt_file as string).trim();
    }

    if (hasPrompt) {
      normalized.prompt = (step.prompt as string);
    }

    if (effectiveModel) {
      normalized.model = effectiveModel;
    }

    return normalized;
  });

  validateUniqueness(steps.map((step) => step.id), "step");

  const knownSteps = new Set(steps.map((step) => step.id));
  for (const step of steps) {
    const validTransitionTargets = new Set([...knownSteps, "done", "human_intervention"]);
    if (!validTransitionTargets.has(step.next_step)) {
      throw new ValidationError(
        `Invalid next_step "${step.next_step}" in step "${step.id}".`
      );
    }
  }

  return {
    id,
    name,
    ...(version && { version }),
    ...(topLevelHarness && { harness: topLevelHarness }),
    ...(topLevelModel && { model: topLevelModel }),
    steps
  };
}
