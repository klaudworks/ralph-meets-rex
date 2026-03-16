import { describe, expect, test } from "bun:test";

import { assertRequiredInputs, resolveTemplate } from "./templating";

describe("templating", () => {
  test("resolves task, plain vars, and namespaced vars", () => {
    const rendered = resolveTemplate("Task={{task}} issue={{issue_id}} plan={{planner.items_json}}", {
      task: "build",
      issue_id: "123",
      "planner.items_json": "[]"
    });

    expect(rendered).toBe("Task=build issue=123 plan=[]");
  });

  test("throws on missing template variable", () => {
    expect(() => resolveTemplate("Missing {{developer.summary}}", { task: "x" })).toThrow(
      'Template variable "developer.summary" is missing.'
    );
  });

  test("asserts required inputs", () => {
    expect(() => assertRequiredInputs(["task"], { task: "x" })).not.toThrow();
    expect(() => assertRequiredInputs(["task", "issue_id"], { task: "x" })).toThrow(
      "Missing required input values"
    );
  });
});
