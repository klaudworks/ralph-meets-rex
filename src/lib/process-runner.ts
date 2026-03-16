import { StorageError } from "./errors";
import type { ProviderCommand, StreamLineParser } from "./provider-adapters";
import { ui } from "./ui";

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  sessionId: string | null;
}

async function consumeStream(
  stream: ReadableStream<Uint8Array> | null,
  onText: (chunk: string) => void
): Promise<string> {
  if (!stream) {
    return "";
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onText(chunk);
  }

  fullText += decoder.decode();
  return fullText;
}

/**
 * Format tool input for display, extracting key parameters.
 */
function formatToolInput(toolInput: string): string {
  try {
    const parsed = JSON.parse(toolInput);
    // Show key parameters in a compact form
    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      return "";
    }
    // Format as key=value pairs
    const parts = entries.map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      // Truncate long values
      const truncated = strValue.length > 60 ? strValue.slice(0, 57) + "..." : strValue;
      return `${key}=${truncated}`;
    });
    return parts.join(" ");
  } catch {
    // If not valid JSON, return as-is (truncated)
    return toolInput.length > 100 ? toolInput.slice(0, 97) + "..." : toolInput;
  }
}

/**
 * Consume a stream line-by-line, parsing each line with the given parser.
 * Displays tool calls with inputs in real-time.
 * Returns the accumulated display text and any session ID found.
 */
async function consumeStreamParsed(
  stream: ReadableStream<Uint8Array> | null,
  parser: StreamLineParser
): Promise<{ rawOutput: string; displayText: string; sessionId: string | null }> {
  if (!stream) {
    return { rawOutput: "", displayText: "", sessionId: null };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let rawOutput = "";
  let displayText = "";
  let sessionId: string | null = null;
  let lineBuf = "";

  let lastTextWasContent = false;

  function processLine(line: string) {
    const parsed = parser(line);
    if (!parsed) {
      return;
    }

    if (parsed.toolName) {
      // Add newline separator if we were outputting content
      if (lastTextWasContent) {
        process.stderr.write("\n");
        lastTextWasContent = false;
      }

      // Display the tool call with its input
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    rawOutput += chunk;
    lineBuf += chunk;

    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";

    for (const line of lines) {
      processLine(line);
    }
  }

  // Process any remaining partial line
  rawOutput += decoder.decode();
  if (lineBuf.trim()) {
    processLine(lineBuf);
  }

  return { rawOutput, displayText, sessionId };
}

export async function runProviderCommand(
  command: ProviderCommand,
  parseStreamLine: StreamLineParser
): Promise<ProcessRunResult> {
  let processRef: Bun.Subprocess<"ignore", "pipe", "pipe">;

  try {
    processRef = Bun.spawn({
      cmd: [command.binary, ...command.args],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch {
    throw new StorageError(`Failed to launch provider binary "${command.binary}".`);
  }

  // Trap SIGINT while the child is running so Rex survives Ctrl+C.
  // The signal still reaches the child (same process group), which will
  // exit with a non-zero code that the runner handles via pauseRun().
  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
  };
  process.on("SIGINT", onSigint);

  // All providers now use the unified stream parsing path
  const stdoutPromise = consumeStreamParsed(processRef.stdout, parseStreamLine);
  const stderrPromise = consumeStream(processRef.stderr, (chunk) => {
    process.stderr.write(chunk);
  });

  const [exitCode, stdoutResult, stderr] = await Promise.all([
    processRef.exited,
    stdoutPromise,
    stderrPromise
  ]);

  // Restore default SIGINT behaviour after child exits.
  process.removeListener("SIGINT", onSigint);

  return {
    exitCode: interrupted && exitCode === 0 ? 130 : exitCode,
    stdout: stdoutResult.displayText,
    stderr,
    combinedOutput: `${stdoutResult.displayText}${stderr}`,
    sessionId: stdoutResult.sessionId
  };
}
