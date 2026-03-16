import { Command } from "clipanion";
import { basename } from "node:path";

import { BaseCommand } from "./base";
import { binaryName } from "../lib/binary-name";
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

export class RootCommand extends BaseCommand {
  public static paths = [Command.Default];

  public async execute(): Promise<number> {
    const shell = detectShell();

    process.stdout.write(`${binaryName} ${getVersion()} - multi-step coding workflows for AI agents\n\n`);
    process.stdout.write("Setup\n");
    process.stdout.write(`  ${binaryName} install <name>      Install bundled workflow into .rmr/workflows/\n\n`);
    process.stdout.write("Workflow\n");
    process.stdout.write(
      `  ${binaryName} run <workflow-path>  Start a new workflow run (requires --task/-t or --task-file/-f)\n`
    );
    process.stdout.write(`  ${binaryName} continue <run-id>   Resume a paused or interrupted run\n\n`);

    process.stdout.write("Shell Completion (optional)\n");
    if (shell === "fish") {
      process.stdout.write(`  ${binaryName} completion fish > ~/.config/fish/completions/${binaryName}.fish\n\n`);
    } else if (shell) {
      const rcFile = shell === "zsh" ? "~/.zshrc" : "~/.bashrc";
      process.stdout.write(`  echo 'eval "$(${binaryName} completion ${shell})"' >> ${rcFile}\n`);
      process.stdout.write(`  source ${rcFile}\n\n`);
    } else {
      process.stdout.write(`  echo 'eval \"\$(${binaryName} completion zsh)\"' >> ~/.zshrc && source ~/.zshrc\n`);
      process.stdout.write(`  echo 'eval \"\$(${binaryName} completion bash)\"' >> ~/.bashrc && source ~/.bashrc\n`);
      process.stdout.write(`  ${binaryName} completion fish > ~/.config/fish/completions/${binaryName}.fish\n\n`);
    }

    process.stdout.write("More\n");
    process.stdout.write(`  ${binaryName} --help              Show full help with all options\n`);
    process.stdout.write(`  ${binaryName} <command> --help    Show help for a specific command\n`);

    return 0;
  }
}
