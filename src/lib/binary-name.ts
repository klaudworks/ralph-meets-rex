import { basename } from "node:path";

function detectBinaryName(): string {
  const invokedPath = process.argv[1];
  const invokedName = invokedPath ? basename(invokedPath) : "";

  if (invokedName !== "" && !invokedName.endsWith(".js") && !invokedName.endsWith(".ts")) {
    return invokedName;
  }

  return "rmr";
}

export const binaryName = detectBinaryName();
