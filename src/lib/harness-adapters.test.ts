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

  test("codex allow-all mapping", () => {
    const adapter = getHarnessAdapter("codex");
    const command = adapter.buildRunCommand("hello", { allowAll: true });
    expect(command.args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(command.args).toContain("--json");
    expect(command.args[0]).toBe("exec");
  });

  test("opencode run command has --format json", () => {
    const adapter = getHarnessAdapter("opencode");
    const command = adapter.buildRunCommand("hello", { allowAll: false });
    expect(command.binary).toBe("opencode");
    expect(command.args[0]).toBe("run");
    expect(command.args).toContain("--format");
    expect(command.args).toContain("json");
    expect(command.args).toContain("hello");
    expect(command.env).toBeUndefined();
  });

  test("opencode allow-all maps to OPENCODE_PERMISSION env", () => {
    const adapter = getHarnessAdapter("opencode");
    const command = adapter.buildRunCommand("hello", { allowAll: true });
    expect(command.env?.OPENCODE_PERMISSION).toBeDefined();
    const parsed = JSON.parse(command.env?.OPENCODE_PERMISSION ?? "{}");
    expect(parsed["*"]).toBe("allow");
    expect(parsed.external_directory).toBe("allow");
    expect(parsed.doom_loop).toBe("allow");
  });

  test("opencode resume uses --session flag", () => {
    const adapter = getHarnessAdapter("opencode");
    const command = adapter.buildResumeCommand("ses_abc", "hello", { allowAll: false });
    expect(command.args).toContain("--session");
    expect(command.args).toContain("ses_abc");
    expect(command.args).toContain("--format");
    expect(command.args).toContain("json");
    expect(command.env).toBeUndefined();
  });

  test("opencode resume with allow-all maps to OPENCODE_PERMISSION env", () => {
    const adapter = getHarnessAdapter("opencode");
    const command = adapter.buildResumeCommand("ses_abc", "hello", { allowAll: true });
    expect(command.env?.OPENCODE_PERMISSION).toBeDefined();
  });

  test("codex run command has --json flag", () => {
    const adapter = getHarnessAdapter("codex");
    const command = adapter.buildRunCommand("hello", { allowAll: false });
    expect(command.args).toContain("--json");
    expect(command.args[0]).toBe("exec");
  });

  test("codex resume uses exec resume subcommand", () => {
    const adapter = getHarnessAdapter("codex");
    const command = adapter.buildResumeCommand("abc-123", "hello", { allowAll: false });
    expect(command.args[0]).toBe("exec");
    expect(command.args[1]).toBe("resume");
    expect(command.args).toContain("--json");
    expect(command.args).toContain("abc-123");
    expect(command.args).toContain("hello");
  });

  test("codex resume with allow-all enables full access sandbox", () => {
    const adapter = getHarnessAdapter("codex");
    const command = adapter.buildResumeCommand("abc-123", "hello", { allowAll: true });
    expect(command.args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(command.args).toContain("--json");
  });

  test("resume templates render by harness", () => {
    expect(getHarnessAdapter("claude").resumeTemplate("abc")).toBe("claude --resume abc");
    expect(getHarnessAdapter("opencode").resumeTemplate("abc")).toBe("opencode run --session abc");
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

  // --- Claude stream parser tests ---

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

  // --- OpenCode stream parser tests ---

  test("opencode parser extracts text from text events", () => {
    const adapter = getHarnessAdapter("opencode");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "text",
      sessionID: "ses_abc123",
      part: {
        type: "text",
        text: "hello"
      }
    });
    const result = parser(line);
    expect(result).toEqual({ text: "hello", sessionId: "ses_abc123" });
  });

  test("opencode parser extracts session ID from step_start", () => {
    const adapter = getHarnessAdapter("opencode");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "step_start",
      sessionID: "ses_abc123",
      part: { type: "step-start" }
    });
    const result = parser(line);
    expect(result).toEqual({ text: "", sessionId: "ses_abc123" });
  });

  test("opencode parser extracts tool use", () => {
    const adapter = getHarnessAdapter("opencode");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "tool_use",
      sessionID: "ses_abc123",
      part: {
        type: "tool",
        tool: "bash",
        state: {
          input: { command: "ls", description: "Lists files" },
          output: "file1.txt\nfile2.txt\n"
        }
      }
    });
    const result = parser(line);
    expect(result).toEqual({
      text: "",
      sessionId: "ses_abc123",
      toolName: "bash",
      toolInput: '{"command":"ls","description":"Lists files"}'
    });
  });

  test("opencode parser returns null for empty lines", () => {
    const adapter = getHarnessAdapter("opencode");
    const parser = adapter.createStreamParser();
    expect(parser("")).toBeNull();
    expect(parser("   ")).toBeNull();
  });

  test("opencode parser returns null for non-JSON", () => {
    const adapter = getHarnessAdapter("opencode");
    const parser = adapter.createStreamParser();
    expect(parser("not json")).toBeNull();
  });

  // --- Codex stream parser tests ---

  test("codex parser extracts thread_id from thread.started", () => {
    const adapter = getHarnessAdapter("codex");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "thread.started",
      thread_id: "019cfa-abc-123"
    });
    const result = parser(line);
    expect(result).toEqual({ text: "", sessionId: "019cfa-abc-123" });
  });

  test("codex parser extracts text from agent_message item.completed", () => {
    const adapter = getHarnessAdapter("codex");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "hello world" }
    });
    const result = parser(line);
    expect(result).toEqual({ text: "hello world" });
  });

  test("codex parser extracts tool call from command_execution item.completed", () => {
    const adapter = getHarnessAdapter("codex");
    const parser = adapter.createStreamParser();
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "command_execution",
        command: "/bin/zsh -lc ls",
        aggregated_output: "file1.txt\n",
        exit_code: 0,
        status: "completed"
      }
    });
    const result = parser(line);
    expect(result).toEqual({ text: "", toolName: "shell", toolInput: "/bin/zsh -lc ls" });
  });

  test("codex parser returns null for turn.started and turn.completed", () => {
    const adapter = getHarnessAdapter("codex");
    const parser = adapter.createStreamParser();
    expect(parser(JSON.stringify({ type: "turn.started" }))).toBeNull();
    expect(parser(JSON.stringify({ type: "turn.completed", usage: {} }))).toBeNull();
  });

  test("codex parser returns null for empty lines", () => {
    const adapter = getHarnessAdapter("codex");
    const parser = adapter.createStreamParser();
    expect(parser("")).toBeNull();
    expect(parser("   ")).toBeNull();
  });

  test("codex parser returns null for non-JSON", () => {
    const adapter = getHarnessAdapter("codex");
    const parser = adapter.createStreamParser();
    expect(parser("not json")).toBeNull();
  });
});
