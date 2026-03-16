import { StorageError } from "./errors";
import type { ProviderCommand } from "./provider-adapters";

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  combinedOutput: string;
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

export async function runProviderCommand(command: ProviderCommand): Promise<ProcessRunResult> {
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

  const stdoutPromise = consumeStream(processRef.stdout, (chunk) => {
    process.stdout.write(chunk);
  });
  const stderrPromise = consumeStream(processRef.stderr, (chunk) => {
    process.stderr.write(chunk);
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    processRef.exited,
    stdoutPromise,
    stderrPromise
  ]);

  return {
    exitCode,
    stdout,
    stderr,
    combinedOutput: `${stdout}${stderr}`
  };
}
