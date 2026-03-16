import { ValidationError } from "./errors";
import type { ProviderName } from "./types";

export interface ProviderAdapterOptions {
  model?: string;
  allowAll: boolean;
}

export interface ProviderCommand {
  binary: string;
  args: string[];
}

export interface StreamParsedChunk {
  text: string;
  sessionId?: string | undefined;
  toolName?: string | undefined;
}

export type StreamLineParser = (line: string) => StreamParsedChunk | null;

export interface ProviderAdapter {
  name: ProviderName;
  buildRunCommand(prompt: string, options: ProviderAdapterOptions): ProviderCommand;
  buildResumeCommand(
    sessionId: string,
    prompt: string,
    options: ProviderAdapterOptions
  ): ProviderCommand;
  /**
   * Parse a single stdout line and return displayable text + optional session id.
   * Return null if the line should be skipped.
   * Providers with structured output (e.g. stream-json) parse and extract text.
   * Providers without structured output use a passthrough parser.
   */
  parseStreamLine: StreamLineParser;
  resumeTemplate(sessionId: string): string;
}

/**
 * Passthrough parser for providers without structured output.
 * Simply returns the line as displayable text.
 */
function createPassthroughParser(): StreamLineParser {
  return (line: string) => ({ text: line + "\n" });
}

function withModelArgs(model: string | undefined, args: string[]): string[] {
  if (!model) {
    return args;
  }

  return [...args, "--model", model];
}

function claudeStreamFlags(): string[] {
  return ["--output-format", "stream-json", "--verbose", "--include-partial-messages"];
}

function parseClaudeStreamLine(line: string): StreamParsedChunk | null {
  if (!line.trim()) {
    return null;
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }

  const type = obj.type as string | undefined;

  // Extract session_id from any event that carries it
  const sessionId = typeof obj.session_id === "string" ? obj.session_id : undefined;

  if (type === "stream_event") {
    const event = obj.event as Record<string, unknown> | undefined;
    if (event?.type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return { text: delta.text, sessionId };
      }
      // input_json_delta — tool input streaming, skip display
      return sessionId ? { text: "", sessionId } : null;
    }
    if (event?.type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use" && typeof block.name === "string") {
        return { text: "", sessionId, toolName: block.name };
      }
    }
    // Other stream events (message_start, content_block_stop, etc.) — skip display
    return sessionId ? { text: "", sessionId } : null;
  }

  if (type === "result") {
    // Final result — text already displayed via deltas, just capture session_id
    return sessionId ? { text: "", sessionId } : null;
  }

  if (type === "system") {
    return sessionId ? { text: "", sessionId } : null;
  }

  return null;
}

const adapters: Record<ProviderName, ProviderAdapter> = {
  claude: {
    name: "claude",
    buildRunCommand(prompt, options) {
      const allowArgs = options.allowAll ? ["--dangerously-skip-permissions"] : [];
      const base = ["-p", prompt, ...claudeStreamFlags()];
      return { binary: "claude", args: withModelArgs(options.model, [...allowArgs, ...base]) };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const base = ["--resume", sessionId, "-p", prompt, ...claudeStreamFlags()];
      return { binary: "claude", args: withModelArgs(options.model, base) };
    },
    parseStreamLine: parseClaudeStreamLine,
    resumeTemplate(sessionId) {
      return `claude --resume ${sessionId}`;
    }
  },
  opencode: {
    name: "opencode",
    buildRunCommand(prompt, options) {
      const args = ["run", prompt];
      return { binary: "opencode", args: withModelArgs(options.model, args) };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const args = ["--resume", sessionId, "run", prompt];
      return { binary: "opencode", args: withModelArgs(options.model, args) };
    },
    parseStreamLine: createPassthroughParser(),
    resumeTemplate(sessionId) {
      return `opencode --resume ${sessionId}`;
    }
  },
  codex: {
    name: "codex",
    buildRunCommand(prompt, options) {
      const auto = options.allowAll ? ["--full-auto"] : [];
      const args = [...auto, "exec", prompt];
      return { binary: "codex", args: withModelArgs(options.model, args) };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const args = ["exec", "resume", sessionId, prompt];
      return { binary: "codex", args: withModelArgs(options.model, args) };
    },
    parseStreamLine: createPassthroughParser(),
    resumeTemplate(sessionId) {
      return `codex exec resume ${sessionId} "<prompt>"`;
    }
  },
  copilot: {
    name: "copilot",
    buildRunCommand(prompt, options) {
      const auto = options.allowAll ? ["--allow-all", "--no-ask-user"] : [];
      const args = [...auto, "-p", prompt];
      return { binary: "copilot", args: withModelArgs(options.model, args) };
    },
    buildResumeCommand(_sessionId, prompt, options) {
      const args = ["-p", prompt];
      return { binary: "copilot", args: withModelArgs(options.model, args) };
    },
    parseStreamLine: createPassthroughParser(),
    resumeTemplate(sessionId) {
      return `copilot --resume ${sessionId}`;
    }
  }
};

export function getProviderAdapter(name: string): ProviderAdapter {
  const adapter = adapters[name as ProviderName];
  if (!adapter) {
    throw new ValidationError(`Unknown provider "${name}".`);
  }

  return adapter;
}
