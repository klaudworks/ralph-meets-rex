#!/usr/bin/env node
import { Builtins, Cli } from "clipanion";

import { CompleteCommand } from "./commands/complete";
import { CompletionCommand } from "./commands/completion";
import { ContinueCommand } from "./commands/continue";
import { InstallCommand } from "./commands/install";
import { ListCommand } from "./commands/list";
import { RootCommand } from "./commands/root";
import { RmrError } from "./lib/errors";
import { logger } from "./lib/logger";
import { RunCommand } from "./commands/run";
import { getVersion } from "./lib/version";

const [, , ...args] = process.argv;

const cli = new Cli({
  binaryName: "rmr",
  binaryVersion: getVersion(),
  enableColors: false
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(RootCommand);
cli.register(InstallCommand);
cli.register(ListCommand);
cli.register(RunCommand);
cli.register(ContinueCommand);
cli.register(CompleteCommand);
cli.register(CompletionCommand);

try {
  const exitCode = await cli.run(args);

  process.exitCode = Math.max(process.exitCode ?? 0, exitCode);
} catch (error) {
  if (error instanceof RmrError) {
    logger.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof Error) {
    logger.error(error.message);
    process.exitCode = 1;
  } else {
    logger.error("Unknown error");
    process.exitCode = 1;
  }
}
