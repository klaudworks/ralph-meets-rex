import { describe, expect, test } from "bun:test";

import { parseRexOutput, validateRequiredOutputKeys } from "./rex-output-parser";

describe("parseRexOutput", () => {
  test("parses a single rex_output block", () => {
    const output = parseRexOutput(`hello\n<rex_output><status>done</status><summary>ok</summary></rex_output>`);
    expect(output.status).toBe("done");
    expect(output.values.summary).toBe("ok");
  });

  test("throws when missing block", () => {
    expect(() => parseRexOutput("no xml here")).toThrow("Missing <rex_output> block");
  });

  test("throws on multiple blocks", () => {
    expect(() =>
      parseRexOutput("<rex_output><status>done</status></rex_output><rex_output></rex_output>")
    ).toThrow("Multiple <rex_output> blocks");
  });

  test("validates required keys", () => {
    const output = parseRexOutput("<rex_output><status>done</status><summary>ok</summary></rex_output>");
    expect(() => validateRequiredOutputKeys(output, ["summary"])) .not.toThrow();
    expect(() => validateRequiredOutputKeys(output, ["items_json"])) .toThrow("Missing required output keys");
  });
});
