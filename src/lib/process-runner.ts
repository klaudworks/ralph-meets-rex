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
 * Consume a stream line-by-line, parsing each line with the given parser.
 * Displays text deltas in real-time and a compact tool summary.
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

  const toolCounts = new Map<string, number>();
  let toolLineActive = false;
  let lastTextWasContent = false;

  function printToolLine() {
    if (toolCounts.size === 0) {
      return;
    }

    const summary = ui.toolSummary(toolCounts);
    if (toolLineActive) {
      ui.printToolLine(summary, true);
    } else {
      if (lastTextWasContent) {
        process.stderr.write("\n");
      }
      ui.printToolLine(summary, false);
      toolLineActive = true;
    }
  }

  function processLine(line: string) {
    const parsed = parser(line);
    if (!parsed) {
      return;
    }

    if (parsed.toolName) {
      toolCounts.set(parsed.toolName, (toolCounts.get(parsed.toolName) ?? 0) + 1);
      printToolLine();
    }

    if (parsed.text) {
      if (toolLineActive) {
        ui.clearToolLine();
        toolLineActive = false;
      }
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

  // Print final tool summary if tools were used
  if (toolCounts.size > 0) {
    if (!toolLineActive) {
      if (lastTextWasContent) {
        process.stderr.write("\n");
      }
    } else {
      ui.clearToolLine();
    }
    const summary = ui.toolSummary(toolCounts);
    ui.printToolLine(summary, false);
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

  return {
    exitCode,
    stdout: stdoutResult.displayText,
    stderr,
    combinedOutput: `${stdoutResult.displayText}${stderr}`,
    sessionId: stdoutResult.sessionId
  };
}
