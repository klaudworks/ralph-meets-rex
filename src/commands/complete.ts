import { Command, Option } from "clipanion";

import { loadConfig } from "../lib/config";
import { UserInputError } from "../lib/errors";
import { listRunIdCompletions, listWorkflowCompletions } from "../lib/completions";

type CompletionTarget = "run-id" | "workflow";

function parseTarget(value: string): CompletionTarget {
  if (value === "run-id" || value === "workflow") {
    return value;
  }

  throw new UserInputError(`Invalid completion target "${value}".`);
}

export class CompleteCommand extends Command {
  public static paths = [["complete"]];

  public readonly target = Option.String({
    name: "target"
  });

  public readonly partial = Option.String({
    required: false,
    name: "partial"
  });

  public async execute(): Promise<number> {
    const config = await loadConfig();
    const target = parseTarget(this.target);
    const query = this.partial ?? "";

    const suggestions =
      target === "run-id"
        ? await listRunIdCompletions(config, query)
        : await listWorkflowCompletions(config, query);

    for (const value of suggestions) {
      process.stdout.write(`${value}\n`);
    }

    return 0;
  }
}
