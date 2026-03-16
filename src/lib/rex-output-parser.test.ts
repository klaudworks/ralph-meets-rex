import { describe, expect, test } from "bun:test";

import { parseRexOutput, validateRequiredOutputKeys } from "./rex-output-parser";

describe("parseRexOutput", () => {
  test("parses rex:* tags from text", () => {
    const output = parseRexOutput(`hello\n<rex:status>done</rex:status>\n<rex:summary>ok</rex:summary>`);
    expect(output.status).toBe("done");
    expect(output.values.summary).toBe("ok");
  });

  test("throws when no rex: tags found", () => {
    expect(() => parseRexOutput("no xml here")).toThrow("No <rex:*> tags found");
  });

  test("validates required keys", () => {
    const output = parseRexOutput("<rex:status>done</rex:status>\n<rex:summary>ok</rex:summary>");
    expect(() => validateRequiredOutputKeys(output, ["summary"])).not.toThrow();
    expect(() => validateRequiredOutputKeys(output, ["items_json"])).toThrow("Missing required output keys");
  });

  test("parses multiline field values", () => {
    const output = parseRexOutput(`<rex:status>done</rex:status>
<rex:plan>Step 1: do thing
Step 2: do other thing</rex:plan>`);
    expect(output.status).toBe("done");
    expect(output.values.plan).toBe("Step 1: do thing\nStep 2: do other thing");
  });

  test("extracts next_state", () => {
    const output = parseRexOutput(`<rex:status>done</rex:status>
<rex:next_state>implement</rex:next_state>
<rex:issues>Fix the bug</rex:issues>`);
    expect(output.next_state).toBe("implement");
    expect(output.values.issues).toBe("Fix the bug");
  });

  test("finds rex: tags scattered in prose", () => {
    const text = `Here is some agent prose about what I did.

I made some changes to the codebase.

<rex:status>done</rex:status>
<rex:summary>Implemented the feature</rex:summary>`;
    const output = parseRexOutput(text);
    expect(output.status).toBe("done");
    expect(output.values.summary).toBe("Implemented the feature");
  });

  test("last value wins for duplicate tags", () => {
    const text = `<rex:status>pending</rex:status>
Some text in between...
<rex:status>done</rex:status>
<rex:summary>final</rex:summary>`;
    const output = parseRexOutput(text);
    expect(output.status).toBe("done");
  });
});
