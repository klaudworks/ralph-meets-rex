import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

export function getVersion(): string {
  if (cached) return cached;

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "..", "package.json"),
    resolve(thisDir, "..", "..", "package.json")
  ];

  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { version?: string };
      if (pkg.version) {
        cached = pkg.version;
        return cached;
      }
    } catch {
      // try next
    }
  }

  cached = "0.0.0";
  return cached;
}
