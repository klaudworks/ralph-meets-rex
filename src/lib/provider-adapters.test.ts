import { describe, expect, test } from "bun:test";

import { getProviderAdapter } from "./provider-adapters";

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
});
