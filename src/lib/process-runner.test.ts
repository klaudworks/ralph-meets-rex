import { describe, expect, mock, test } from "bun:test";

import { formatToolInput } from "./process-runner";

describe("formatToolInput", () => {
  const workspaceRoot = "/Users/nico/tries/2026-03-16-antsfarm";

  test("strips workspace root from absolute file paths", () => {
    const cwdMock = mock(process.cwd);
    cwdMock.mockReturnValue(workspaceRoot);

    const output = formatToolInput(
      JSON.stringify({ file_path: `${workspaceRoot}/src/lib/workflow-loader.ts` })
    );

    expect(output).toBe("file_path=src/lib/workflow-loader.ts");
    cwdMock.mockRestore();
  });

  test("truncates long path parameters from the beginning", () => {
    const cwdMock = mock(process.cwd);
    cwdMock.mockReturnValue(workspaceRoot);

    const longPath = `${workspaceRoot}/src/lib/really/deep/path/with/a/very/long/segment/workflow-loader.ts`;
    const output = formatToolInput(JSON.stringify({ filePath: longPath }));

    expect(output.startsWith("filePath=...")).toBe(true);
    expect(output.endsWith("workflow-loader.ts")).toBe(true);
    cwdMock.mockRestore();
  });

  test("does not strip paths outside workspace", () => {
    const cwdMock = mock(process.cwd);
    cwdMock.mockReturnValue(workspaceRoot);

    const output = formatToolInput(JSON.stringify({ file_path: "/tmp/another-project/src/main.ts" }));

    expect(output).toBe("file_path=/tmp/another-project/src/main.ts");
    cwdMock.mockRestore();
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
