import { describe, expect, test } from "bun:test";

import { formatToolInput } from "./process-runner";

describe("formatToolInput", () => {
  const workspaceRoot = process.cwd();

  test("strips workspace root from absolute file paths", () => {
    const output = formatToolInput(
      JSON.stringify({ file_path: `${workspaceRoot}/src/lib/workflow-loader.ts` })
    );

    expect(output).toBe("file_path=src/lib/workflow-loader.ts");
  });

  test("truncates long path parameters from the beginning", () => {
    const longPath = `${workspaceRoot}/src/lib/really/deep/path/with/a/very/long/segment/workflow-loader.ts`;
    const output = formatToolInput(JSON.stringify({ filePath: longPath }));

    expect(output.startsWith("filePath=...")).toBe(true);
    expect(output.endsWith("workflow-loader.ts")).toBe(true);
  });

  test("does not strip paths outside workspace", () => {
    const output = formatToolInput(JSON.stringify({ file_path: "/tmp/another-project/src/main.ts" }));

    expect(output).toBe("file_path=/tmp/another-project/src/main.ts");
  });

  test("non-path parameters still truncate from the end", () => {
    const longCommand = "run " + "x".repeat(100);
    const output = formatToolInput(JSON.stringify({ command: longCommand }));

    expect(output.startsWith("command=run ")).toBe(true);
    expect(output.endsWith("...")).toBe(true);
  });

  test("path key with non-path text uses end truncation", () => {
    const output = formatToolInput(JSON.stringify({ path: "not a real path " + "x".repeat(80) }));

    expect(output.startsWith("path=not a real path ")).toBe(true);
    expect(output.endsWith("...")).toBe(true);
  });
});
