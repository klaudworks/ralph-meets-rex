import { describe, expect, test } from "bun:test";

import { getHarnessAdapter } from "./harness-adapters";
import { HARNESSES } from "./types";

describe("harness adapters", () => {
  test("claude allow-all mapping", () => {
    const adapter = getHarnessAdapter("claude");
    const command = adapter.buildRunCommand("hello", { allowAll: true });
    expect(command.binary).toBe("claude");
    expect(command.args).toContain("--dangerously-skip-permissions");
    expect(command.args).toContain("-p");
  });

  test("codex no-allow-all mapping", () => {
    const adapter = getHarnessAdapter("codex");
    const command = adapter.buildRunCommand("hello", { allowAll: false });
    expect(command.args).not.toContain("--full-auto");
    expect(command.args[0]).toBe("exec");
  });

  test("resume templates render by harness", () => {
    expect(getHarnessAdapter("claude").resumeTemplate("abc")).toBe("claude --resume abc");
    expect(getHarnessAdapter("opencode").resumeTemplate("abc")).toBe("opencode --resume abc");
    expect(getHarnessAdapter("codex").resumeTemplate("abc")).toContain("codex exec resume abc");
  });

  test("unknown harness throws", () => {
    expect(() => getHarnessAdapter("unknown")).toThrow('Unknown harness "unknown".');
  });

  test("all harnesses have createStreamParser function", () => {
    for (const harness of HARNESSES) {
      const adapter = getHarnessAdapter(harness);
      expect(typeof adapter.createStreamParser).toBe("function");
    }
  });

  test("passthrough parser returns line with newline", () => {
    const adapter = getHarnessAdapter("opencode");
    const parser = adapter.createStreamParser();
    const result = parser("hello world");
    expect(result).toEqual({ text: "hello world\n" });
  });

  test("claude parser extracts text delta", () => {
    const adapter = getHarnessAdapter("claude");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "stream_event",
      session_id: "abc",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello" }
      }
    });
    const result = parser(line);
    expect(result).toEqual({ text: "Hello", sessionId: "abc" });
  });

  test("claude parser extracts tool name and input on block stop", () => {
    const adapter = getHarnessAdapter("claude");
    const parser = adapter.createStreamParser();

    // Start the tool block
    const startLine = JSON.stringify({
      type: "stream_event",
      session_id: "abc",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", name: "Read" }
      }
    });
    const startResult = parser(startLine);
    expect(startResult).toEqual({ text: "", sessionId: "abc" });

    // Send input delta
    const inputLine = JSON.stringify({
      type: "stream_event",
      session_id: "abc",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"file_path":"/test.txt"}' }
      }
    });
    const inputResult = parser(inputLine);
    expect(inputResult).toEqual({ text: "", sessionId: "abc" });

    // Stop the block - should emit tool with input
    const stopLine = JSON.stringify({
      type: "stream_event",
      session_id: "abc",
      event: {
        type: "content_block_stop",
        index: 0
      }
    });
    const stopResult = parser(stopLine);
    expect(stopResult).toEqual({
      text: "",
      sessionId: "abc",
      toolName: "Read",
      toolInput: '{"file_path":"/test.txt"}'
    });
  });
});
