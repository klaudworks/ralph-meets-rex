import { describe, expect, test } from "bun:test";

import { assertRequiredInputs, resolveTemplate } from "./templating";

describe("templating", () => {
  test("resolves task, plain vars, and namespaced vars", () => {
    const rendered = resolveTemplate("Task={{task}} issue={{issue_id}} plan={{plan.items_json}}", {
      task: "build",
      issue_id: "123",
      "plan.items_json": "[]"
    });

    expect(rendered).toBe("Task=build issue=123 plan=[]");
  });

  test("resolves missing template variable to empty string", () => {
    const rendered = resolveTemplate("Missing {{implement.summary}}", { task: "x" });
    expect(rendered).toBe("Missing ");
  });

  test("asserts required inputs", () => {
    expect(() => assertRequiredInputs(["task"], { task: "x" })).not.toThrow();
    expect(() => assertRequiredInputs(["task", "issue_id"], { task: "x" })).toThrow(
      "Missing required input values"
    );
  });
});
