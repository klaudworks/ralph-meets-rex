import { ValidationError } from "./errors";

const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function assertRequiredInputs(required: string[], context: Record<string, string>): void {
  const missing = required.filter((key) => {
    const value = context[key];
    return typeof value !== "string" || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new ValidationError(`Missing required input values: ${missing.join(", ")}.`);
  }
}

export function resolveTemplate(template: string, context: Record<string, string>): string {
  return template.replace(TEMPLATE_VARIABLE_REGEX, (_full, key: string) => {
    const value = context[key];
    if (typeof value !== "string" || value.trim() === "") {
      return "";
    }

    return value;
  });
}
