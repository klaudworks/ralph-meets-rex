import { ValidationError } from "./errors";
import type { HarnessName } from "./types";

export interface HarnessAdapterOptions {
  model?: string;
  allowAll: boolean;
}

export interface HarnessCommand {
  binary: string;
  args: string[];
  env?: Record<string, string>;
}

export interface StreamParsedChunk {
  text: string;
  sessionId?: string | undefined;
  toolName?: string | undefined;
  toolInput?: string | undefined;
}

export type StreamLineParser = (line: string) => StreamParsedChunk | null;

export interface HarnessAdapter {
  name: HarnessName;
  buildRunCommand(prompt: string, options: HarnessAdapterOptions): HarnessCommand;
  buildResumeCommand(
    sessionId: string,
    prompt: string,
    options: HarnessAdapterOptions
  ): HarnessCommand;
  /**
   * Create a fresh parser for a single harness run.
   * The parser processes stdout lines and returns displayable text + optional metadata.
   * Harnesses with structured output (e.g. stream-json) parse and extract text.
   * Harnesses without structured output use a passthrough parser.
   */
  createStreamParser(): StreamLineParser;
  resumeTemplate(sessionId: string): string;
}

/**
 * Passthrough parser for harnesses without structured output.
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

function opencodePermissionEnv(): Record<string, string> {
  return {
    OPENCODE_PERMISSION: JSON.stringify({
      "*": "allow",
      external_directory: "allow",
      doom_loop: "allow"
    })
  };
}

function claudeStreamFlags(): string[] {
  return ["--output-format", "stream-json", "--verbose", "--include-partial-messages"];
}

/**
 * Create a stateful parser for OpenCode JSON output.
 * OpenCode emits JSONL with types: step_start, text, tool_use, step_finish.
 * Session ID is in the top-level `sessionID` field.
 */
function createOpenCodeStreamParser(): StreamLineParser {
  return (line: string): StreamParsedChunk | null => {
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
    const sessionId = typeof obj.sessionID === "string" ? obj.sessionID : undefined;

    if (type === "text") {
      const part = obj.part as Record<string, unknown> | undefined;
      const text = typeof part?.text === "string" ? part.text : "";
      return { text, sessionId };
    }

    if (type === "tool_use") {
      const part = obj.part as Record<string, unknown> | undefined;
      const toolName = typeof part?.tool === "string" ? part.tool : undefined;
      const state = part?.state as Record<string, unknown> | undefined;
      const input = state?.input as Record<string, unknown> | undefined;
      const toolInput = input ? JSON.stringify(input) : undefined;
      return { text: "", sessionId, toolName, toolInput };
    }

    // step_start, step_finish, and others — just capture session ID
    if (sessionId) {
      return { text: "", sessionId };
    }

    return null;
  };
}

/**
 * Create a stateful parser for Codex JSONL output.
 * Codex emits JSONL with types: thread.started, turn.started,
 * item.started, item.completed, turn.completed.
 * Thread ID is in the `thread_id` field of `thread.started`.
 */
function createCodexStreamParser(): StreamLineParser {
  return (line: string): StreamParsedChunk | null => {
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

    if (type === "thread.started") {
      const sessionId = typeof obj.thread_id === "string" ? obj.thread_id : undefined;
      return sessionId ? { text: "", sessionId } : null;
    }

    if (type === "item.completed") {
      const item = obj.item as Record<string, unknown> | undefined;
      if (!item) {
        return null;
      }

      if (item.type === "agent_message") {
        const text = typeof item.text === "string" ? item.text : "";
        return { text };
      }

      if (item.type === "command_execution") {
        const command = typeof item.command === "string" ? item.command : "shell";
        return { text: "", toolName: "shell", toolInput: command };
      }

      return null;
    }

    if (type === "item.started") {
      const item = obj.item as Record<string, unknown> | undefined;
      if (item?.type === "command_execution") {
        const command = typeof item.command === "string" ? item.command : "shell";
        return { text: "", toolName: "shell", toolInput: command };
      }
      return null;
    }

    // turn.started, turn.completed — skip
    return null;
  };
}

/**
 * Create a stateful parser for Claude stream-json output.
 * Tracks current tool block to accumulate input JSON deltas.
 */
function createClaudeStreamParser(): StreamLineParser {
  let currentToolName: string | null = null;
  let currentToolInput = "";
  let currentBlockIndex: number | null = null;

  return (line: string): StreamParsedChunk | null => {
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
      const index = typeof event?.index === "number" ? event.index : null;

      if (event?.type === "content_block_start") {
        const block = event.content_block as Record<string, unknown> | undefined;
        if (block?.type === "tool_use" && typeof block.name === "string") {
          // Start of a new tool block
          currentToolName = block.name;
          currentToolInput = "";
          currentBlockIndex = index;
          // Don't emit yet - wait for input
          return sessionId ? { text: "", sessionId } : null;
        }
      }

      if (event?.type === "content_block_delta") {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          return { text: delta.text, sessionId };
        }
        if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          // Accumulate tool input JSON
          currentToolInput += delta.partial_json;
          return sessionId ? { text: "", sessionId } : null;
        }
        return sessionId ? { text: "", sessionId } : null;
      }

      if (event?.type === "content_block_stop") {
        // Block finished - if this was a tool block, emit it now with accumulated input
        if (currentToolName && index === currentBlockIndex) {
          const result: StreamParsedChunk = {
            text: "",
            sessionId,
            toolName: currentToolName,
            toolInput: currentToolInput || undefined
          };
          currentToolName = null;
          currentToolInput = "";
          currentBlockIndex = null;
          return result;
        }
      }

      // Other stream events (message_start, etc.) — skip display
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
  };
}

const adapters: Record<HarnessName, HarnessAdapter> = {
  claude: {
    name: "claude",
    buildRunCommand(prompt, options) {
      const allowArgs = options.allowAll ? ["--dangerously-skip-permissions"] : [];
      const base = ["-p", prompt, ...claudeStreamFlags()];
      return { binary: "claude", args: withModelArgs(options.model, [...allowArgs, ...base]) };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const allowArgs = options.allowAll ? ["--dangerously-skip-permissions"] : [];
      const base = [...allowArgs, "--resume", sessionId, "-p", prompt, ...claudeStreamFlags()];
      return { binary: "claude", args: withModelArgs(options.model, base) };
    },
    createStreamParser: createClaudeStreamParser,
    resumeTemplate(sessionId) {
      return `claude --resume ${sessionId}`;
    }
  },
  opencode: {
    name: "opencode",
    buildRunCommand(prompt, options) {
      const args = ["run", "--format", "json", prompt];
      return {
        binary: "opencode",
        args: withModelArgs(options.model, args),
        ...(options.allowAll ? { env: opencodePermissionEnv() } : {})
      };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const args = ["run", "--format", "json", "--session", sessionId, prompt];
      return {
        binary: "opencode",
        args: withModelArgs(options.model, args),
        ...(options.allowAll ? { env: opencodePermissionEnv() } : {})
      };
    },
    createStreamParser: createOpenCodeStreamParser,
    resumeTemplate(sessionId) {
      return `opencode run --session ${sessionId}`;
    }
  },
  codex: {
    name: "codex",
    buildRunCommand(prompt, options) {
      const auto = options.allowAll ? ["--dangerously-bypass-approvals-and-sandbox"] : [];
      const args = ["exec", "--json", ...auto, prompt];
      return { binary: "codex", args: withModelArgs(options.model, args) };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const auto = options.allowAll ? ["--dangerously-bypass-approvals-and-sandbox"] : [];
      const args = ["exec", "resume", "--json", ...auto, sessionId, prompt];
      return { binary: "codex", args: withModelArgs(options.model, args) };
    },
    createStreamParser: createCodexStreamParser,
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
    createStreamParser: createPassthroughParser,
    resumeTemplate(sessionId) {
      return `copilot --resume ${sessionId}`;
    }
  }
};

export function getHarnessAdapter(name: string): HarnessAdapter {
  const adapter = adapters[name as HarnessName];
  if (!adapter) {
    throw new ValidationError(`Unknown harness "${name}".`);
  }

  return adapter;
}
