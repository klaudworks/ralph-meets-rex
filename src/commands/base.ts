import { Command } from "clipanion";

import { RmrError } from "../lib/errors";
import { ui } from "../lib/ui";

export abstract class BaseCommand extends Command {
  public async catch(error: unknown): Promise<void> {
    if (error instanceof RmrError) {
      ui.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}
