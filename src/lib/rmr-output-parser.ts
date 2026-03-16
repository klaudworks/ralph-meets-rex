import { ValidationError } from "./errors";

export interface RmrStepOutput {
  status?: string | undefined;
  next_state?: string | undefined;
  values: Record<string, string>;
}

const REX_TAG_REGEX = /<rmr:([a-z][a-z0-9_]*)>([\s\S]*?)<\/rmr:\1>/g;

export function parseRmrOutput(rawText: string): RmrStepOutput {
  const values: Record<string, string> = {};
  let fieldCount = 0;

  for (const match of rawText.matchAll(REX_TAG_REGEX)) {
    const key = match[1];
    if (!key) {
      continue;
    }

    const value = match[2]?.trim() ?? "";
    values[key] = value;
    fieldCount += 1;
  }

  if (fieldCount === 0) {
    throw new ValidationError("No <rmr:*> tags found in output.");
  }

  const output: RmrStepOutput = { values };
  if (typeof values.status === "string") {
    output.status = values.status;
  }
  if (typeof values.next_state === "string") {
    output.next_state = values.next_state;
  }

  return output;
}

export function validateRequiredOutputKeys(
  output: RmrStepOutput,
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
