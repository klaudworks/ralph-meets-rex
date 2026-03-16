import { ValidationError } from "./errors";

export interface RexStepOutput {
  status?: string | undefined;
  next_state?: string | undefined;
  values: Record<string, string>;
}

const OUTPUT_BLOCK_REGEX = /<rex_output>([\s\S]*?)<\/rex_output>/g;
const XML_FIELD_REGEX = /<([a-z][a-z0-9_]*)>([\s\S]*?)<\/\1>/g;

export function parseRexOutput(rawText: string): RexStepOutput {
  const blocks = Array.from(rawText.matchAll(OUTPUT_BLOCK_REGEX));

  if (blocks.length === 0) {
    throw new ValidationError("Missing <rex_output> block.");
  }

  if (blocks.length > 1) {
    throw new ValidationError("Multiple <rex_output> blocks found.");
  }

  const block = blocks[0]?.[1];
  if (!block) {
    throw new ValidationError("Malformed <rex_output> block.");
  }

  const values: Record<string, string> = {};
  let fieldCount = 0;

  for (const match of block.matchAll(XML_FIELD_REGEX)) {
    const key = match[1];
    if (!key) {
      continue;
    }

    const value = match[2]?.trim() ?? "";
    values[key] = value;
    fieldCount += 1;
  }

  if (fieldCount === 0) {
    throw new ValidationError("Malformed <rex_output> XML fields.");
  }

  const output: RexStepOutput = { values };
  if (typeof values.status === "string") {
    output.status = values.status;
  }
  if (typeof values.next_state === "string") {
    output.next_state = values.next_state;
  }

  return output;
}

export function validateRequiredOutputKeys(
  output: RexStepOutput,
  requiredKeys: string[]
): void {
  const missing = requiredKeys.filter((key) => {
    const value = output.values[key];
    return typeof value !== "string" || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new ValidationError(`Missing required output keys: ${missing.join(", ")}.`);
  }
}
