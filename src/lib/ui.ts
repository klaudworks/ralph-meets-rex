/**
 * Centralized UI module for styled CLI output.
 * Provides consistent visual language for workflow execution.
 */

const isTTY = process.stdout.isTTY === true;

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m"
} as const;

function style(code: string, text: string): string {
  if (!isTTY) {
    return text;
  }
  return `${code}${text}${colors.reset}`;
}

export const ui = {
  /**
   * Check if output is a TTY (for conditional formatting).
   */
  get isTTY(): boolean {
    return isTTY;
  },

  /**
   * Render workflow initialization header box.
   */
  workflowHeader(info: {
    title: string;
    workflow: string;
    workflowId: string;
    task: string;
    runId: string;
    currentStep: string;
    runFile: string;
    allowAll: boolean;
    provider?: string | undefined;
    model?: string | undefined;
    varsCount: number;
  }): void {
    const line = isTTY ? "─" : "-";
    const corner = {
      tl: isTTY ? "╭" : "+",
      tr: isTTY ? "╮" : "+",
      bl: isTTY ? "╰" : "+",
      br: isTTY ? "╯" : "+"
    };

    const width = 60;
    const border = line.repeat(width - 2);

    process.stdout.write("\n");
    process.stdout.write(style(colors.cyan, `${corner.tl}${line} ${info.title} ${border.slice(info.title.length + 3)}${corner.tr}\n`));
    process.stdout.write(style(colors.dim, `│ ${`workflow:    ${info.workflow}`.padEnd(width - 4)} │\n`));
    process.stdout.write(style(colors.dim, `│ ${`workflow-id: ${info.workflowId}`.padEnd(width - 4)} │\n`));
    process.stdout.write(style(colors.dim, `│ ${`run-id:      ${info.runId}`.padEnd(width - 4)} │\n`));
    process.stdout.write(style(colors.dim, `│ ${`step:        ${info.currentStep}`.padEnd(width - 4)} │\n`));

    const taskLine = info.task.length > 40 ? info.task.slice(0, 37) + "..." : info.task;
    process.stdout.write(style(colors.dim, `│ ${`task:        ${taskLine}`.padEnd(width - 4)} │\n`));

    process.stdout.write(style(colors.cyan, `${corner.bl}${border}${corner.br}\n`));
    process.stdout.write("\n");
  },

  /**
   * Render step start header.
   */
  stepStart(stepId: string, agentId: string): void {
    const line = isTTY ? "─" : "-";
    const corner = { tl: isTTY ? "┌" : "+", tr: isTTY ? "┐" : "+" };
    const label = ` Step: ${stepId} (${agentId}) `;
    const width = 60;
    const remaining = width - label.length - 2;
    const border = line.repeat(remaining);

    process.stdout.write("\n");
    process.stdout.write(style(colors.cyan + colors.bold, `${corner.tl}${line}${label}${border}${corner.tr}\n`));
    process.stdout.write("\n");
  },

  /**
   * Render step end footer.
   */
  stepEnd(): void {
    const line = isTTY ? "─" : "-";
    const corner = { bl: isTTY ? "└" : "+", br: isTTY ? "┘" : "+" };
    const width = 60;
    const border = line.repeat(width - 2);

    process.stdout.write("\n");
    process.stdout.write(style(colors.cyan, `${corner.bl}${border}${corner.br}\n`));
  },

  /**
   * Render tool usage summary in dimmed style.
   */
  toolSummary(counts: Map<string, number>): string {
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const shown = entries.slice(0, 6);
    const remaining = entries.length - shown.length;
    const parts = shown.map(([name, count]) => `${name} ${count}`);
    if (remaining > 0) {
      parts.push(`+${remaining} more`);
    }
    return parts.join(" │ ");
  },

  /**
   * Print tool summary line to stderr (dimmed).
   */
  printToolLine(summary: string, isUpdate: boolean): void {
    if (isUpdate && isTTY) {
      // Clear previous line before rewriting
      process.stderr.write(`\x1b[1A\x1b[2K`);
    }
    process.stderr.write(style(colors.gray, `  tools: ${summary}\n`));
  },

  /**
   * Clear the current tool line (for resuming content output).
   */
  clearToolLine(): void {
    if (isTTY) {
      process.stderr.write(`\x1b[1A\x1b[2K`);
    }
  },

  /**
   * Write content text to stdout.
   */
  content(text: string): void {
    process.stdout.write(text);
  },

  /**
   * Print a success message.
   */
  success(text: string): void {
    const icon = isTTY ? "✓ " : "";
    process.stdout.write(style(colors.green, `${icon}${text}\n`));
  },

  /**
   * Print a warning message.
   */
  warning(text: string): void {
    const icon = isTTY ? "⚠ " : "";
    process.stderr.write(style(colors.yellow, `${icon}${text}\n`));
  },

  /**
   * Print an error message.
   */
  error(text: string): void {
    const icon = isTTY ? "✗ " : "";
    process.stderr.write(style(colors.red, `${icon}${text}\n`));
  },

  /**
   * Print an info line.
   */
  info(text: string): void {
    process.stdout.write(`${text}\n`);
  },

  /**
   * Print dimmed text.
   */
  dim(text: string): void {
    process.stdout.write(style(colors.gray, text));
  },

  /**
   * Print pause/resume instructions.
   */
  pauseInstructions(info: {
    reason: string;
    runId: string;
    resumeCommand: string;
  }): void {
    const line = isTTY ? "─" : "-";
    const width = 60;

    process.stderr.write("\n");
    ui.warning(`Paused: ${info.reason}`);
    process.stderr.write("\n");
    process.stdout.write(style(colors.dim, `Resume workflow:\n`));
    process.stdout.write(`  rex continue ${info.runId}\n`);
    process.stdout.write("\n");
    process.stdout.write(style(colors.dim, `Resume agent session directly:\n`));
    process.stdout.write(`  ${info.resumeCommand}\n`);
    process.stdout.write("\n");
  }
};
