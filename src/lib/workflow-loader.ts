import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";

import { ValidationError } from "./errors";
import type { ProviderName, WorkflowDefinition } from "./types";

const SUPPORTED_PROVIDERS = new Set<ProviderName>([
  "claude",
  "claude-code",
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

  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    throw new ValidationError("Workflow must define a non-empty agents array.");
  }

  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new ValidationError("Workflow must define a non-empty steps array.");
  }

  const agents = parsed.agents.map((rawAgent, index) => {
    if (!rawAgent || typeof rawAgent !== "object") {
      throw new ValidationError(`Invalid agents[${index}] definition.`);
    }

    const agent = rawAgent as Record<string, unknown>;
    const agentId = ensureString(agent.id, `agents[${index}].id`);
    const provider = ensureString(agent.provider, `agents[${index}].provider`) as ProviderName;

    if (!SUPPORTED_PROVIDERS.has(provider)) {
      throw new ValidationError(`Unsupported provider "${provider}" for agent "${agentId}".`);
    }

    const prompt = ensureString(agent.prompt, `agents[${index}].prompt`);
    const model = agent.model;
    const normalized = {
      id: agentId,
      provider,
      prompt
    };

    if (typeof model === "string" && model.trim() !== "") {
      return {
        ...normalized,
        model
      };
    }

    return normalized;
  });

  const steps = parsed.steps.map((rawStep, index) => {
    if (!rawStep || typeof rawStep !== "object") {
      throw new ValidationError(`Invalid steps[${index}] definition.`);
    }

    const step = rawStep as Record<string, unknown>;
    const outputs = step.outputs as Record<string, unknown> | undefined;

    if (!outputs || typeof outputs !== "object") {
      throw new ValidationError(`Invalid step field "steps[${index}].outputs": expected object.`);
    }

    return {
      id: ensureString(step.id, `steps[${index}].id`),
      agent: ensureString(step.agent, `steps[${index}].agent`),
      default_next: ensureString(step.default_next, `steps[${index}].default_next`),
      input_required: ensureStringArray(step.input_required, `steps[${index}].input_required`),
      outputs: {
        required: ensureStringArray(outputs.required, `steps[${index}].outputs.required`)
      },
      input: ensureString(step.input, `steps[${index}].input`)
    };
  });

  validateUniqueness(agents.map((agent) => agent.id), "agent");
  validateUniqueness(steps.map((step) => step.id), "step");

  const knownAgents = new Set(agents.map((agent) => agent.id));
  const knownSteps = new Set(steps.map((step) => step.id));

  for (const step of steps) {
    if (!knownAgents.has(step.agent)) {
      throw new ValidationError(`Unknown agent "${step.agent}" referenced by step "${step.id}".`);
    }

    const validTransitionTargets = new Set([...knownSteps, "done", "human_intervention"]);
    if (!validTransitionTargets.has(step.default_next)) {
      throw new ValidationError(
        `Invalid default_next "${step.default_next}" in step "${step.id}".`
      );
    }
  }

  return {
    id,
    name,
    agents,
    steps
  };
}
