import { describe, expect, test } from "bun:test";

import { getProviderAdapter } from "./provider-adapters";
import { PROVIDERS } from "./types";

describe("provider adapters", () => {
  test("claude allow-all mapping", () => {
    const adapter = getProviderAdapter("claude");
    const command = adapter.buildRunCommand("hello", { allowAll: true });
    expect(command.binary).toBe("claude");
    expect(command.args).toContain("--dangerously-skip-permissions");
    expect(command.args).toContain("-p");
  });

  test("codex no-allow-all mapping", () => {
    const adapter = getProviderAdapter("codex");
    const command = adapter.buildRunCommand("hello", { allowAll: false });
    expect(command.args).not.toContain("--full-auto");
    expect(command.args[0]).toBe("exec");
  });

  test("resume templates render by provider", () => {
    expect(getProviderAdapter("claude").resumeTemplate("abc")).toBe("claude --resume abc");
    expect(getProviderAdapter("opencode").resumeTemplate("abc")).toBe("opencode --resume abc");
    expect(getProviderAdapter("codex").resumeTemplate("abc")).toContain("codex exec resume abc");
  });

  test("unknown provider throws", () => {
    expect(() => getProviderAdapter("unknown")).toThrow('Unknown provider "unknown".');
  });

  test("all providers have parseStreamLine function", () => {
    for (const provider of PROVIDERS) {
      const adapter = getProviderAdapter(provider);
      expect(typeof adapter.parseStreamLine).toBe("function");
    }
  });

  test("passthrough parser returns line with newline", () => {
    const adapter = getProviderAdapter("opencode");
    const result = adapter.parseStreamLine("hello world");
    expect(result).toEqual({ text: "hello world\n" });
  });

  test("claude parser extracts text delta", () => {
    const adapter = getProviderAdapter("claude");
    const line = JSON.stringify({
      type: "stream_event",
      session_id: "abc",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello" }
      }
    });
    const result = adapter.parseStreamLine(line);
    expect(result).toEqual({ text: "Hello", sessionId: "abc" });
  });

  test("claude parser extracts tool name", () => {
    const adapter = getProviderAdapter("claude");
    const line = JSON.stringify({
      type: "stream_event",
      session_id: "abc",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read" }
      }
    });
    const result = adapter.parseStreamLine(line);
    expect(result).toEqual({ text: "", sessionId: "abc", toolName: "Read" });
  });
});
