/**
 * Centralized UI module for styled CLI output.
 * Provides consistent visual language for workflow execution.
 */

import chalk from "chalk";

const isTTY = process.stdout.isTTY === true;

/**
 * Get terminal width with fallback.
 */
function getTerminalWidth(): number {
  return process.stdout.columns ?? 80;
}

/**
 * Get box width - full terminal width minus small margin.
 */
function getBoxWidth(): number {
  const termWidth = getTerminalWidth();
  // Leave 2 char margin on right side
  return Math.max(40, termWidth - 2);
}

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Word-wrap text to fit within a given width.
 * Returns an array of lines.
 */
function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text];
  }

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > maxWidth) {
    let breakAt = remaining.lastIndexOf(" ", maxWidth);
    if (breakAt <= 0) {
      breakAt = maxWidth;
    }
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining) {
    lines.push(remaining);
  }

  return lines;
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
    workflowId?: string;
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

    const width = getBoxWidth();
    const contentWidth = width - 4; // Account for "│ " and " │"
    const border = line.repeat(width - 2);

    const labelWidth = 10; // "workflow: " length
    const valueWidth = contentWidth - labelWidth;

    const formatLine = (label: string, value: string): string => {
      const paddedLabel = label ? `${label}:`.padEnd(labelWidth) : " ".repeat(labelWidth);
      const truncatedValue = truncate(value, valueWidth);
      return `${paddedLabel}${truncatedValue}`.padEnd(contentWidth);
    };

    process.stdout.write("\n");
    process.stdout.write(
      isTTY
        ? chalk.cyan(`${corner.tl}${line} ${info.title} ${border.slice(info.title.length + 3)}${corner.tr}\n`)
        : `${corner.tl}${line} ${info.title} ${border.slice(info.title.length + 3)}${corner.tr}\n`
    );
    process.stdout.write(
      isTTY
        ? chalk.dim(`│ ${formatLine("workflow", info.workflow)} │\n`)
        : `│ ${formatLine("workflow", info.workflow)} │\n`
    );
    process.stdout.write(
      isTTY
        ? chalk.dim(`│ ${formatLine("run-id", info.runId)} │\n`)
        : `│ ${formatLine("run-id", info.runId)} │\n`
    );
    process.stdout.write(
      isTTY
        ? chalk.dim(`│ ${formatLine("step", info.currentStep)} │\n`)
        : `│ ${formatLine("step", info.currentStep)} │\n`
    );

    // Word-wrap the task across multiple lines, aligned to value column
    const taskLines = wrapText(info.task, valueWidth);
    for (let i = 0; i < taskLines.length; i++) {
      const label = i === 0 ? "task" : "";
      const content = formatLine(label, taskLines[i] ?? "");
      process.stdout.write(
        isTTY
          ? chalk.dim(`│ ${content} │\n`)
          : `│ ${content} │\n`
      );
    }

    process.stdout.write(
      isTTY
        ? chalk.cyan(`${corner.bl}${border}${corner.br}\n`)
        : `${corner.bl}${border}${corner.br}\n`
    );
    process.stdout.write("\n");
  },

  /**
   * Render step start header.
   */
  stepStart(stepId: string, agentId: string): void {
    const line = isTTY ? "─" : "-";
    const corner = { tl: isTTY ? "┌" : "+", tr: isTTY ? "┐" : "+" };
    const label = ` Step: ${stepId} (${agentId}) `;
    const width = getBoxWidth();
    const remaining = Math.max(0, width - label.length - 2);
    const border = line.repeat(remaining);

    process.stdout.write("\n");
    process.stdout.write(
      isTTY
        ? chalk.cyan.bold(`${corner.tl}${line}${label}${border}${corner.tr}\n`)
        : `${corner.tl}${line}${label}${border}${corner.tr}\n`
    );
    process.stdout.write("\n");
  },

  /**
   * Render step end footer.
   */
  stepEnd(): void {
    const line = isTTY ? "─" : "-";
    const corner = { bl: isTTY ? "└" : "+", br: isTTY ? "┘" : "+" };
    const width = getBoxWidth();
    const border = line.repeat(width - 2);

    process.stdout.write("\n");
    process.stdout.write(
      isTTY
        ? chalk.cyan(`${corner.bl}${border}${corner.br}\n`)
        : `${corner.bl}${border}${corner.br}\n`
    );
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
    process.stderr.write(isTTY ? chalk.gray(`  tools: ${summary}\n`) : `  tools: ${summary}\n`);
  },

  /**
   * Print a tool call with its input parameters.
   */
  printToolCall(toolName: string, toolInput: string): void {
    const width = getBoxWidth();
    const maxInputLength = width - 10; // Reserve space for "  ToolName "
    const truncatedInput = truncate(toolInput, maxInputLength);

    if (isTTY) {
      process.stderr.write(chalk.cyan(`  ${toolName} `) + chalk.dim(truncatedInput) + "\n");
    } else {
      process.stderr.write(`  ${toolName} ${truncatedInput}\n`);
    }
  },

  /**
   * Print detected rex: output tags after a step completes.
   */
  stepOutputs(values: Record<string, string>): void {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      return;
    }

    const width = getBoxWidth();
    const labelPrefix = "  ";
    const separator = ": ";

    process.stdout.write("\n");
    for (const [key, value] of entries) {
      const label = `rex:${key}`;
      const firstLineIndent = labelPrefix.length + label.length + separator.length;
      const continuationIndent = " ".repeat(firstLineIndent);
      const maxValueWidth = width - firstLineIndent;

      // Split value into lines, wrap each to fit
      const valueLines = value.split("\n");
      const wrappedLines: string[] = [];
      for (const vline of valueLines) {
        if (vline.length <= maxValueWidth) {
          wrappedLines.push(vline);
        } else {
          // Word-wrap long lines
          let remaining = vline;
          while (remaining.length > maxValueWidth) {
            let breakAt = remaining.lastIndexOf(" ", maxValueWidth);
            if (breakAt <= 0) {
              breakAt = maxValueWidth;
            }
            wrappedLines.push(remaining.slice(0, breakAt));
            remaining = remaining.slice(breakAt).trimStart();
          }
          if (remaining) {
            wrappedLines.push(remaining);
          }
        }
      }

      const firstLine = wrappedLines[0] ?? "";
      if (isTTY) {
        process.stdout.write(chalk.cyan(`${labelPrefix}${label}`) + chalk.dim(`${separator}${firstLine}`) + "\n");
      } else {
        process.stdout.write(`${labelPrefix}${label}${separator}${firstLine}\n`);
      }

      for (let i = 1; i < wrappedLines.length; i++) {
        if (isTTY) {
          process.stdout.write(chalk.dim(`${continuationIndent}${wrappedLines[i]}`) + "\n");
        } else {
          process.stdout.write(`${continuationIndent}${wrappedLines[i]}\n`);
        }
      }
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
    process.stdout.write(isTTY ? chalk.green(`${icon}${text}\n`) : `${icon}${text}\n`);
  },

  /**
   * Print a warning message.
   */
  warning(text: string): void {
    const icon = isTTY ? "⚠ " : "";
    process.stderr.write(isTTY ? chalk.yellow(`${icon}${text}\n`) : `${icon}${text}\n`);
  },

  /**
   * Print an error message.
   */
  error(text: string): void {
    const icon = isTTY ? "✗ " : "";
    process.stderr.write(isTTY ? chalk.red(`${icon}${text}\n`) : `${icon}${text}\n`);
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
    process.stdout.write(isTTY ? chalk.gray(text) : text);
  },

  /**
   * Print pause/resume instructions.
   */
  pauseInstructions(info: {
    reason: string;
    runId: string;
    resumeCommand: string;
  }): void {
    process.stderr.write("\n");
    ui.warning(`Paused: ${info.reason}`);
    process.stderr.write("\n");
    process.stdout.write(isTTY ? chalk.dim("Resume workflow:\n") : "Resume workflow:\n");
    process.stdout.write(`  rex continue ${info.runId}\n`);
    process.stdout.write("\n");
    process.stdout.write(isTTY ? chalk.dim("Resume agent session directly:\n") : "Resume agent session directly:\n");
    process.stdout.write(`  ${info.resumeCommand}\n`);
    process.stdout.write("\n");
  }
};
