import { Command, Option } from "clipanion";

import { UserInputError } from "../lib/errors";

type ShellName = "bash" | "zsh" | "fish";

function parseShell(value: string): ShellName {
  if (value === "bash" || value === "zsh" || value === "fish") {
    return value;
  }

  throw new UserInputError(`Unsupported shell "${value}". Use bash, zsh, or fish.`);
}

function bashScript(): string {
  return [
    "_rex_complete() {",
    "  local cur prev",
    "  COMPREPLY=()",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
    "",
    "  if [[ ${COMP_CWORD} -eq 1 ]]; then",
    "    COMPREPLY=( $(compgen -W \"run continue complete completion --help --version\" -- \"${cur}\") )",
    "    return 0",
    "  fi",
    "",
    "  if [[ \"${prev}\" == \"continue\" ]]; then",
    "    COMPREPLY=( $(rex complete run-id \"${cur}\") )",
    "    return 0",
    "  fi",
    "",
    "  if [[ \"${prev}\" == \"run\" ]]; then",
    "    COMPREPLY=( $(rex complete workflow \"${cur}\") )",
    "    return 0",
    "  fi",
    "}",
    "complete -F _rex_complete rex"
  ].join("\n");
}

function zshScript(): string {
  return [
    "#compdef rex",
    "_rex_complete() {",
    "  local -a subcommands",
    "  subcommands=(run continue complete completion)",
    "",
    "  if (( CURRENT == 2 )); then",
    "    _describe 'command' subcommands",
    "    return",
    "  fi",
    "",
    "  if [[ ${words[2]} == continue && $CURRENT -eq 3 ]]; then",
    "    compadd -- $(rex complete run-id \"${words[CURRENT]}\")",
    "    return",
    "  fi",
    "",
    "  if [[ ${words[2]} == run && $CURRENT -eq 3 ]]; then",
    "    compadd -- $(rex complete workflow \"${words[CURRENT]}\")",
    "    return",
    "  fi",
    "}",
    "compdef _rex_complete rex"
  ].join("\n");
}

function fishScript(): string {
  return [
    "function __rex_complete_run_id",
    "  rex complete run-id (commandline -ct)",
    "end",
    "",
    "function __rex_complete_workflow",
    "  rex complete workflow (commandline -ct)",
    "end",
    "",
    "complete -c rex -f",
    "complete -c rex -n '__fish_use_subcommand' -a 'run continue complete completion'",
    "complete -c rex -n '__fish_seen_subcommand_from continue' -a '(__rex_complete_run_id)'",
    "complete -c rex -n '__fish_seen_subcommand_from run' -a '(__rex_complete_workflow)'"
  ].join("\n");
}

export class CompletionCommand extends Command {
  public static paths = [["completion"]];

  public static usage = Command.Usage({
    category: "Workflow",
    description: "Print optional shell completion setup script.",
    details:
      "Generates completion script text for your shell. Source the output in your shell profile to enable command and dynamic argument completion.",
    examples: [
      ["Show Bash completion script", "$0 completion bash"],
      ["Show Zsh completion script", "$0 completion zsh"],
      ["Show Fish completion script", "$0 completion fish"]
    ]
  });

  public readonly shell = Option.String({
    name: "shell"
  });

  public async execute(): Promise<number> {
    const shell = parseShell(this.shell);
    const script = shell === "bash" ? bashScript() : shell === "zsh" ? zshScript() : fishScript();
    process.stdout.write(`${script}\n`);
    return 0;
  }
}
