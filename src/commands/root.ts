import { Command } from "clipanion";
import { basename } from "node:path";

import { getVersion } from "../lib/version";

type ShellName = "bash" | "zsh" | "fish";

function detectShell(): ShellName | null {
  const raw = process.env.SHELL;
  if (!raw) {
    return null;
  }

  const shell = basename(raw);
  if (shell === "bash" || shell === "zsh" || shell === "fish") {
    return shell;
  }

  return null;
}

export class RootCommand extends Command {
  public static paths = [Command.Default];

  public async execute(): Promise<number> {
    const shell = detectShell();

    process.stdout.write(`rmr ${getVersion()} - multi-step coding workflows for AI agents\n\n`);
    process.stdout.write("Setup\n");
    process.stdout.write("  rmr install <name>      Install bundled workflow into .rmr/workflows/\n\n");
    process.stdout.write("Workflow\n");
    process.stdout.write("  rmr run <workflow-path>  Start a new workflow run (requires --task/-t or --task-file/-f)\n");
    process.stdout.write("  rmr continue <run-id>   Resume a paused or interrupted run\n\n");

    process.stdout.write("Shell Completion (optional)\n");
    if (shell === "fish") {
      process.stdout.write("  rmr completion fish > ~/.config/fish/completions/rmr.fish\n\n");
    } else if (shell) {
      const rcFile = shell === "zsh" ? "~/.zshrc" : "~/.bashrc";
      process.stdout.write(`  echo 'eval "$(rmr completion ${shell})"' >> ${rcFile}\n`);
      process.stdout.write(`  source ${rcFile}\n\n`);
    } else {
      process.stdout.write("  echo 'eval \"$(rmr completion zsh)\"' >> ~/.zshrc && source ~/.zshrc\n");
      process.stdout.write("  echo 'eval \"$(rmr completion bash)\"' >> ~/.bashrc && source ~/.bashrc\n");
      process.stdout.write("  rmr completion fish > ~/.config/fish/completions/rmr.fish\n\n");
    }

    process.stdout.write("More\n");
    process.stdout.write("  rmr --help              Show full help with all options\n");
    process.stdout.write("  rmr <command> --help    Show help for a specific command\n");

    return 0;
  }
}
