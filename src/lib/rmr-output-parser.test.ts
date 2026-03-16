import { describe, expect, test } from "bun:test";

import { parseRmrOutput, validateRequiredOutputKeys } from "./rmr-output-parser";

describe("parseRmrOutput", () => {
  test("parses rmr:* tags from text", () => {
    const output = parseRmrOutput(`hello\n<rmr:status>done</rmr:status>\n<rmr:summary>ok</rmr:summary>`);
    expect(output.status).toBe("done");
    expect(output.values.summary).toBe("ok");
  });

  test("throws when no rmr: tags found", () => {
    expect(() => parseRmrOutput("no xml here")).toThrow("No <rmr:*> tags found");
  });

  test("validates required keys", () => {
    const output = parseRmrOutput("<rmr:status>done</rmr:status>\n<rmr:summary>ok</rmr:summary>");
    expect(() => validateRequiredOutputKeys(output, ["summary"])).not.toThrow();
    expect(() => validateRequiredOutputKeys(output, ["items_json"])).toThrow("Missing required output keys");
  });

  test("parses multiline field values", () => {
    const output = parseRmrOutput(`<rmr:status>done</rmr:status>
<rmr:plan>Step 1: do thing
Step 2: do other thing</rmr:plan>`);
    expect(output.status).toBe("done");
    expect(output.values.plan).toBe("Step 1: do thing\nStep 2: do other thing");
  });

  test("extracts next_state", () => {
    const output = parseRmrOutput(`<rmr:status>done</rmr:status>
<rmr:next_state>implement</rmr:next_state>
<rmr:issues>Fix the bug</rmr:issues>`);
    expect(output.next_state).toBe("implement");
    expect(output.values.issues).toBe("Fix the bug");
  });

  test("finds rmr: tags scattered in prose", () => {
    const text = `Here is some agent prose about what I did.

I made some changes to the codebase.

<rmr:status>done</rmr:status>
<rmr:summary>Implemented the feature</rmr:summary>`;
    const output = parseRmrOutput(text);
    expect(output.status).toBe("done");
    expect(output.values.summary).toBe("Implemented the feature");
  });

  test("last value wins for duplicate tags", () => {
    const text = `<rmr:status>pending</rmr:status>
Some text in between...
<rmr:status>done</rmr:status>
<rmr:summary>final</rmr:summary>`;
    const output = parseRmrOutput(text);
    expect(output.status).toBe("done");
  });
});
