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

export interface ProviderAdapter {
  name: ProviderName;
  buildRunCommand(prompt: string, options: ProviderAdapterOptions): ProviderCommand;
  buildResumeCommand(
    sessionId: string,
    prompt: string,
    options: ProviderAdapterOptions
  ): ProviderCommand;
  parseSessionId(output: string): string | null;
  resumeTemplate(sessionId: string): string;
}

function withModelArgs(model: string | undefined, args: string[]): string[] {
  if (!model) {
    return args;
  }

  return [...args, "--model", model];
}

const adapters: Record<ProviderName, ProviderAdapter> = {
  claude: {
    name: "claude",
    buildRunCommand(prompt, options) {
      const base = ["-p", prompt];
      const allowArgs = options.allowAll ? ["--dangerously-skip-permissions"] : [];
      return { binary: "claude", args: withModelArgs(options.model, [...allowArgs, ...base]) };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const base = ["--resume", sessionId, "-p", prompt];
      return { binary: "claude", args: withModelArgs(options.model, base) };
    },
    parseSessionId() {
      return null;
    },
    resumeTemplate(sessionId) {
      return `claude --resume ${sessionId}`;
    }
  },
  "claude-code": {
    name: "claude-code",
    buildRunCommand(prompt, options) {
      const allowArgs = options.allowAll ? ["--dangerously-skip-permissions"] : [];
      const base = ["-p", prompt];
      return {
        binary: "claude-code",
        args: withModelArgs(options.model, [...allowArgs, ...base])
      };
    },
    buildResumeCommand(sessionId, prompt, options) {
      const base = ["--resume", sessionId, "-p", prompt];
      return { binary: "claude-code", args: withModelArgs(options.model, base) };
    },
    parseSessionId() {
      return null;
    },
    resumeTemplate(sessionId) {
      return `claude-code --resume ${sessionId}`;
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
    parseSessionId() {
      return null;
    },
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
    parseSessionId() {
      return null;
    },
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
    parseSessionId() {
      return null;
    },
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
