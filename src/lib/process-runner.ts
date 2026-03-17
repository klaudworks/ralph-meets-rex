import { spawn } from "node:child_process";
import path from "node:path";

import { StorageError } from "./errors";
import type { HarnessCommand, StreamLineParser } from "./harness-adapters";
import { ui } from "./ui";

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  sessionId: string | null;
}

/**
 * Format tool input for display, extracting key parameters.
 */
const PATH_PARAMETER_KEYS = new Set(["file_path", "filepath", "path", "notebook_path"]);
const PARAMETER_MAX_LENGTH = 60;
const RAW_INPUT_MAX_LENGTH = 100;

function truncateFromEnd(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

function truncateFromBeginning(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return "..." + value.slice(-(maxLength - 3));
}

function isPathParameterKey(key: string): boolean {
  return PATH_PARAMETER_KEYS.has(key.toLowerCase());
}

function looksLikeFilePath(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~/")
  );
}

function stripWorkspacePrefix(filePath: string, workspaceRoot: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const relativePath = path.relative(workspaceRoot, filePath);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }
  if (relativePath === "") {
    return ".";
  }

  return filePath;
}

export function formatToolInput(toolInput: string): string {
  try {
    const parsed = JSON.parse(toolInput);
    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      return "";
    }
    const workspaceRoot = process.cwd();
    const parts = entries.map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const isPathLike = typeof value === "string" && isPathParameterKey(key) && looksLikeFilePath(value);
      const formatted = isPathLike ? stripWorkspacePrefix(strValue, workspaceRoot) : strValue;
      const truncated = isPathLike
        ? truncateFromBeginning(formatted, PARAMETER_MAX_LENGTH)
        : truncateFromEnd(formatted, PARAMETER_MAX_LENGTH);
      return `${key}=${truncated}`;
    });
    return parts.join(" ");
  } catch {
    return truncateFromEnd(toolInput, RAW_INPUT_MAX_LENGTH);
  }
}

export async function runHarnessCommand(
  command: HarnessCommand,
  parseStreamLine: StreamLineParser
): Promise<ProcessRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.binary, command.args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...(command.env ? { env: { ...process.env, ...command.env } } : {})
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new StorageError(
            `Harness binary "${command.binary}" not found. ` +
              `Make sure it is installed and available on your PATH.`
          )
        );
      } else if (err.code === "EACCES") {
        reject(
          new StorageError(
            `Permission denied when trying to run "${command.binary}". ` +
              `Check that the binary is executable.`
          )
        );
      } else {
        reject(
          new StorageError(
            `Failed to launch harness binary "${command.binary}": ${err.message}`
          )
        );
      }
    });

    // Trap SIGINT while the child is running so rmr survives Ctrl+C.
    // The signal still reaches the child (same process group), which will
    // exit with a non-zero code that the runner handles via pauseRun().
    let interrupted = false;
    const onSigint = () => {
      interrupted = true;
    };
    process.on("SIGINT", onSigint);

    let displayText = "";
    let sessionId: string | null = null;
    let stderrText = "";
    let stdoutLineBuf = "";
    let lastTextWasContent = false;

    function processLine(line: string) {
      const parsed = parseStreamLine(line);
      if (!parsed) {
        return;
      }

      if (parsed.toolName) {
        if (lastTextWasContent) {
          process.stderr.write("\n");
          lastTextWasContent = false;
        }
        const inputDisplay = parsed.toolInput ? formatToolInput(parsed.toolInput) : "";
        ui.printToolCall(parsed.toolName, inputDisplay);
      }

      if (parsed.text) {
        displayText += parsed.text;
        ui.content(parsed.text);
        lastTextWasContent = true;
      }

      if (parsed.sessionId) {
        sessionId = parsed.sessionId;
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutLineBuf += text;

      const lines = stdoutLineBuf.split("\n");
      stdoutLineBuf = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrText += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      // Process any remaining partial line
      if (stdoutLineBuf.trim()) {
        processLine(stdoutLineBuf);
      }

      process.removeListener("SIGINT", onSigint);

      const exitCode = interrupted && code === 0 ? 130 : (code ?? 1);

      resolve({
        exitCode,
        stdout: displayText,
        stderr: stderrText,
        combinedOutput: `${displayText}${stderrText}`,
        sessionId
      });
    });
  });
}
