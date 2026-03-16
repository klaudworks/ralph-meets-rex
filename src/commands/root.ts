import { Command } from "clipanion";
import { basename } from "node:path";

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

    process.stdout.write("rex - workflow orchestrator\n\n");
    process.stdout.write("Workflow\n");
    process.stdout.write("  rex run <workflow-path> <task>\n");
    process.stdout.write("  rex continue <run-id>\n\n");

    process.stdout.write("Shell Completion (optional)\n");
    if (shell) {
      process.stdout.write(`  eval \"$(rex completion ${shell})\"\n\n`);
    } else {
      process.stdout.write("  eval \"$(rex completion zsh)\"\n");
      process.stdout.write("  eval \"$(rex completion bash)\"\n");
      process.stdout.write("  source <(rex completion fish)\n\n");
    }

    process.stdout.write("More\n");
    process.stdout.write("  rex --help\n");
    process.stdout.write("  rex <command> --help\n");

    return 0;
  }
}
