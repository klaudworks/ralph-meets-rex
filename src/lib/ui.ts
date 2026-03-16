/**
 * Centralized UI module for styled CLI output.
 * Provides consistent visual language for workflow execution.
 */

import chalk from "chalk";
import * as readline from "node:readline";

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
    runFile: string;
    allowAll: boolean;
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

    // Word-wrap the task across multiple lines, preserving user newlines.
    const taskLines = info.task.split("\n").flatMap((line) => {
      if (line === "") {
        return [""];
      }

      return wrapText(line, valueWidth);
    });
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
  stepStart(
    stepNumber: number,
    stepId: string,
    agentId: string,
    harness: string,
    model?: string
  ): void {
    const line = isTTY ? "─" : "-";
    const corner = { tl: isTTY ? "┌" : "+", tr: isTTY ? "┐" : "+" };
    const label = ` Step ${stepNumber}: ${stepId} (${agentId}) `;
    const width = getBoxWidth();
    const remaining = Math.max(0, width - label.length - 2);
    const border = line.repeat(remaining);

    process.stdout.write("\n");
    process.stdout.write(
      isTTY
        ? chalk.cyan.bold(`${corner.tl}${line}${label}${border}${corner.tr}\n`)
        : `${corner.tl}${line}${label}${border}${corner.tr}\n`
    );
    const metaLine = `  harness: ${harness}    model: ${model ?? "(default)"}`;
    process.stdout.write(isTTY ? chalk.dim(`${metaLine}\n`) : `${metaLine}\n`);
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
   * Print detected rmr: output tags after a step completes.
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
      const label = `rmr:${key}`;
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
    process.stdout.write(`  rmr continue ${info.runId}\n`);
    process.stdout.write("\n");
    process.stdout.write(isTTY ? chalk.dim("Resume agent session directly:\n") : "Resume agent session directly:\n");
    process.stdout.write(`  ${info.resumeCommand}\n`);
    process.stdout.write("\n");
  },

  /**
   * Prompt the user for input. Returns a Promise that resolves to the entered string.
   */
  prompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const styledMessage = isTTY ? chalk.cyan(message) : message;
      rl.question(styledMessage, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  },

  /**
   * Prompt the user for multiline input.
   * Submit with Enter, insert newline with Shift+Enter (when supported).
   */
  multilinePrompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      const input = process.stdin;
      const output = process.stdout;
      const supportsRawMode = input.isTTY && typeof input.setRawMode === "function";
      const styledMessage = isTTY ? chalk.cyan(message) : message;
      const linePrompt = isTTY ? chalk.cyan("> ") : "> ";
      const shiftEnterSequence = "\x1b[13;2u";
      let buffer = "";
      let settled = false;
      let renderedLineCount = 0;

      if (!supportsRawMode) {
        const rl = readline.createInterface({
          input,
          output
        });

        rl.question(`${styledMessage} `, (answer) => {
          rl.close();
          resolve(answer);
        });
        return;
      }

      const cleanup = () => {
        input.off("data", onData);
        input.off("error", onError);
        input.setRawMode(false);
        input.pause();
      };

      const finish = (value: string) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(value);
      };

      const clearRenderedBuffer = () => {
        if (renderedLineCount === 0) {
          return;
        }

        readline.cursorTo(output, 0);
        if (renderedLineCount > 1) {
          readline.moveCursor(output, 0, -(renderedLineCount - 1));
        }
        readline.clearScreenDown(output);
      };

      const renderBuffer = () => {
        clearRenderedBuffer();
        const lines = buffer.split("\n");
        for (let i = 0; i < lines.length; i++) {
          output.write(`${linePrompt}${lines[i] ?? ""}`);
          if (i < lines.length - 1) {
            output.write("\n");
          }
        }
        renderedLineCount = lines.length;
      };

      const appendText = (text: string) => {
        const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!normalized) {
          return;
        }
        buffer += normalized;
        renderBuffer();
      };

      const submit = () => {
        output.write("\n");
        finish(buffer);
      };

      const cancel = () => {
        output.write("\n");
        finish("");
      };

      const onError = () => {
        finish(buffer);
      };

      const onData = (chunk: string | Buffer) => {
        const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");

        if (value === "\x03") {
          cancel();
          return;
        }

        if (value === "\x04") {
          submit();
          return;
        }

        if (value === shiftEnterSequence) {
          appendText("\n");
          return;
        }

        if (value === "\r" || value === "\n") {
          submit();
          return;
        }

        if (value === "\x7f" || value === "\b") {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            renderBuffer();
          }
          return;
        }

        if (value.length > 1) {
          const withoutBracketedPasteMarkers = value
            .replace(/\x1b\[200~/g, "")
            .replace(/\x1b\[201~/g, "");

          if (withoutBracketedPasteMarkers.startsWith("\x1b") && !/[\r\n]/.test(withoutBracketedPasteMarkers)) {
            return;
          }

          appendText(withoutBracketedPasteMarkers);
          return;
        }

        if (value >= " ") {
          appendText(value);
        }
      };

      output.write(styledMessage);
      output.write("\n");
      input.setRawMode(true);
      input.setEncoding("utf8");
      input.resume();
      input.on("data", onData);
      input.on("error", onError);
      renderBuffer();
    });
  }
};
