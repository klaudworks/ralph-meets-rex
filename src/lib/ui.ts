/**
 * Centralized UI module for styled CLI output.
 * Provides consistent visual language for workflow execution.
 */

import chalk from "chalk";
import * as readline from "node:readline";
import { binaryName } from "./binary-name";

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

/**
 * Strip ANSI escape sequences from terminal output.
 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

/**
 * Rough display width in monospace columns.
 */
function displayWidth(text: string): number {
  return Array.from(text).length;
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
    process.stdout.write(`  ${binaryName} continue ${info.runId}\n`);
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
   * Enter inserts a newline. Ctrl+D submits.
   */
  multilinePrompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      const input = process.stdin;
      const output = process.stdout;
      const supportsRawMode = input.isTTY && typeof input.setRawMode === "function";
      const styledMessage = isTTY ? chalk.cyan(message) : message;
      const linePrompt = isTTY ? chalk.cyan("> ") : "> ";
      const promptWidth = displayWidth(stripAnsi(linePrompt));
      let buffer = "";
      let cursor = 0;
      let settled = false;
      let renderedRowCount = 0;

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
        if (renderedRowCount === 0) {
          return;
        }

        readline.cursorTo(output, 0);
        if (renderedRowCount > 1) {
          readline.moveCursor(output, 0, -(renderedRowCount - 1));
        }
        readline.clearScreenDown(output);
      };

      const getRenderedRowCount = (lines: string[]): number => {
        const columns = Math.max(1, getTerminalWidth());
        let rows = 0;

        for (const line of lines) {
          const lineWidth = promptWidth + displayWidth(line);
          rows += Math.max(1, Math.ceil(lineWidth / columns));
        }

        return rows;
      };

      // Get which line the cursor is on and the column within that line
      const getCursorPosition = (): { line: number; col: number } => {
        const textBeforeCursor = buffer.slice(0, cursor);
        const linesBeforeCursor = textBeforeCursor.split("\n");
        const line = linesBeforeCursor.length - 1;
        const col = linesBeforeCursor[line]?.length ?? 0;
        return { line, col };
      };

      // Get the start index in buffer for a given line number
      const getLineStart = (lineNum: number): number => {
        const lines = buffer.split("\n");
        let idx = 0;
        for (let i = 0; i < lineNum && i < lines.length; i++) {
          idx += (lines[i]?.length ?? 0) + 1; // +1 for newline
        }
        return idx;
      };

      // Get the end index in buffer for a given line number (before the newline)
      const getLineEnd = (lineNum: number): number => {
        const lines = buffer.split("\n");
        if (lineNum >= lines.length) {
          return buffer.length;
        }
        return getLineStart(lineNum) + (lines[lineNum]?.length ?? 0);
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
        renderedRowCount = getRenderedRowCount(lines);

        // Position the cursor correctly
        const { line: cursorLine, col: cursorCol } = getCursorPosition();
        const columns = Math.max(1, getTerminalWidth());

        // Calculate how many rows from the end of buffer to the cursor position
        let rowsFromEnd = 0;
        for (let i = lines.length - 1; i > cursorLine; i--) {
          const lineWidth = promptWidth + displayWidth(lines[i] ?? "");
          rowsFromEnd += Math.max(1, Math.ceil(lineWidth / columns));
        }

        // Calculate cursor's row within its line (for wrapped lines)
        const cursorLineWidth = promptWidth + cursorCol;
        const totalLineWidth = promptWidth + displayWidth(lines[cursorLine] ?? "");
        const totalRowsInCursorLine = Math.max(1, Math.ceil(totalLineWidth / columns));
        const cursorRowInLine = Math.floor(cursorLineWidth / columns);
        const rowsAfterCursorInLine = totalRowsInCursorLine - cursorRowInLine - 1;
        rowsFromEnd += rowsAfterCursorInLine;

        // Move cursor up and to correct column
        if (rowsFromEnd > 0) {
          readline.moveCursor(output, 0, -rowsFromEnd);
        }
        readline.cursorTo(output, cursorLineWidth % columns);
      };

      const insertText = (text: string) => {
        const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!normalized) {
          return;
        }
        buffer = buffer.slice(0, cursor) + normalized + buffer.slice(cursor);
        cursor += normalized.length;
        renderBuffer();
      };

      const submit = () => {
        // Move cursor to end before submitting for clean output
        const lines = buffer.split("\n");
        const lastLineIdx = lines.length - 1;
        const columns = Math.max(1, getTerminalWidth());
        const { line: cursorLine } = getCursorPosition();

        // Calculate rows to move down to reach the end
        let rowsToEnd = 0;
        for (let i = cursorLine + 1; i < lines.length; i++) {
          const lineWidth = promptWidth + displayWidth(lines[i] ?? "");
          rowsToEnd += Math.max(1, Math.ceil(lineWidth / columns));
        }
        // Add remaining rows in current line if it wraps
        const cursorLineWidth = promptWidth + displayWidth(lines[cursorLine] ?? "");
        const totalRowsInCursorLine = Math.max(1, Math.ceil(cursorLineWidth / columns));
        const { col: cursorCol } = getCursorPosition();
        const cursorRowInLine = Math.floor((promptWidth + cursorCol) / columns);
        rowsToEnd += totalRowsInCursorLine - cursorRowInLine - 1;

        if (rowsToEnd > 0) {
          readline.moveCursor(output, 0, rowsToEnd);
        }
        const lastLineWidth = promptWidth + displayWidth(lines[lastLineIdx] ?? "");
        readline.cursorTo(output, lastLineWidth % columns);

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

        // Ctrl+C - cancel
        if (value === "\x03") {
          cancel();
          return;
        }

        // Ctrl+D - submit
        if (value === "\x04") {
          submit();
          return;
        }

        // Ctrl+A - jump to start of current line
        if (value === "\x01") {
          const { line } = getCursorPosition();
          cursor = getLineStart(line);
          renderBuffer();
          return;
        }

        // Ctrl+E - jump to end of current line
        if (value === "\x05") {
          const { line } = getCursorPosition();
          cursor = getLineEnd(line);
          renderBuffer();
          return;
        }

        // Ctrl+U - delete to start of current line
        if (value === "\x15") {
          const { line } = getCursorPosition();
          const lineStart = getLineStart(line);
          buffer = buffer.slice(0, lineStart) + buffer.slice(cursor);
          cursor = lineStart;
          renderBuffer();
          return;
        }

        // Ctrl+W - delete word backward
        if (value === "\x17") {
          if (cursor === 0) {
            return;
          }
          // Find word boundary backward
          let newCursor = cursor - 1;
          // Skip trailing whitespace/newlines
          while (newCursor > 0 && /\s/.test(buffer[newCursor] ?? "")) {
            newCursor--;
          }
          // Delete until whitespace or start
          while (newCursor > 0 && !/\s/.test(buffer[newCursor - 1] ?? "")) {
            newCursor--;
          }
          buffer = buffer.slice(0, newCursor) + buffer.slice(cursor);
          cursor = newCursor;
          renderBuffer();
          return;
        }

        // Enter/Return - insert newline at cursor
        if (value === "\r" || value === "\n") {
          insertText("\n");
          return;
        }

        // Backspace - delete character before cursor
        if (value === "\x7f" || value === "\b") {
          if (cursor > 0) {
            buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
            cursor--;
            renderBuffer();
          }
          return;
        }

        // Handle escape sequences and multi-byte input
        if (value.length > 1) {
          const withoutBracketedPasteMarkers = value
            .replace(/\x1b\[200~/g, "")
            .replace(/\x1b\[201~/g, "");

          // Arrow keys and other escape sequences
          if (withoutBracketedPasteMarkers.startsWith("\x1b")) {
            const seq = withoutBracketedPasteMarkers;

            // Left arrow
            if (seq === "\x1b[D") {
              if (cursor > 0) {
                cursor--;
                renderBuffer();
              }
              return;
            }

            // Right arrow
            if (seq === "\x1b[C") {
              if (cursor < buffer.length) {
                cursor++;
                renderBuffer();
              }
              return;
            }

            // Up arrow - move to previous line, same column
            if (seq === "\x1b[A") {
              const { line, col } = getCursorPosition();
              if (line > 0) {
                const prevLineStart = getLineStart(line - 1);
                const prevLineEnd = getLineEnd(line - 1);
                const prevLineLen = prevLineEnd - prevLineStart;
                cursor = prevLineStart + Math.min(col, prevLineLen);
                renderBuffer();
              }
              return;
            }

            // Down arrow - move to next line, same column
            if (seq === "\x1b[B") {
              const lines = buffer.split("\n");
              const { line, col } = getCursorPosition();
              if (line < lines.length - 1) {
                const nextLineStart = getLineStart(line + 1);
                const nextLineEnd = getLineEnd(line + 1);
                const nextLineLen = nextLineEnd - nextLineStart;
                cursor = nextLineStart + Math.min(col, nextLineLen);
                renderBuffer();
              }
              return;
            }

            // Home key (various sequences)
            if (seq === "\x1b[H" || seq === "\x1b[1~" || seq === "\x1bOH") {
              const { line } = getCursorPosition();
              cursor = getLineStart(line);
              renderBuffer();
              return;
            }

            // End key (various sequences)
            if (seq === "\x1b[F" || seq === "\x1b[4~" || seq === "\x1bOF") {
              const { line } = getCursorPosition();
              cursor = getLineEnd(line);
              renderBuffer();
              return;
            }

            // Unknown escape sequence - ignore it
            if (!/[\r\n]/.test(withoutBracketedPasteMarkers)) {
              return;
            }
          }

          // Pasted text - insert at cursor
          insertText(withoutBracketedPasteMarkers);
          return;
        }

        // Regular printable character - insert at cursor
        if (value >= " ") {
          insertText(value);
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
