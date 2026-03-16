import { copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RexConfig } from "./config";
import { logger } from "./logger";

const FRONTMATTER_MANAGED_REGEX = /^---\s*\nrex-managed:\s*true\s*\n---/;
const COMMENT_MANAGED_REGEX = /^# rex-managed:\s*true/;

function isManagedContent(content: string): boolean {
  return FRONTMATTER_MANAGED_REGEX.test(content) || COMMENT_MANAGED_REGEX.test(content);
}

/** Resolve the templates/ directory shipped with the rex package. */
function getTemplatesDir(): string {
  // Works both when running from source (src/lib/scaffold.ts → ../../templates)
  // and from built bundle (dist/index.js → ../templates)
  const thisFile = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Try built layout first (dist/index.js → templates/)
  const fromDist = resolve(thisDir, "..", "templates");
  // Then source layout (src/lib/ → templates/)
  const fromSrc = resolve(thisDir, "..", "..", "templates");

  try {
    // Sync check — fine at startup, runs once
    const fs = require("node:fs") as typeof import("node:fs");
    if (fs.existsSync(resolve(fromDist, "agents"))) return fromDist;
    if (fs.existsSync(resolve(fromSrc, "agents"))) return fromSrc;
  } catch {
    // fallback
  }

  return fromSrc;
}

interface ManagedFile {
  /** Path relative to templates/ and .rex/ */
  relativePath: string;
}

const MANAGED_FILES: ManagedFile[] = [
  { relativePath: "agents/planner.md" },
  { relativePath: "agents/tackle.md" },
  { relativePath: "agents/review.md" },
  { relativePath: "workflows/feature-dev.yml" }
];

async function shouldWrite(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf8");
    // File exists — only overwrite if it's still marked as managed
    return isManagedContent(content);
  } catch {
    // File doesn't exist — write it
    return true;
  }
}

export async function ensureScaffold(config: RexConfig): Promise<void> {
  const templatesDir = getTemplatesDir();
  let written = 0;

  for (const file of MANAGED_FILES) {
    const targetPath = resolve(config.rexDir, file.relativePath);

    if (!(await shouldWrite(targetPath))) {
      continue;
    }

    const sourcePath = resolve(templatesDir, file.relativePath);
    await copyFile(sourcePath, targetPath);
    written++;
  }

  if (written > 0) {
    logger.info(`Scaffolded ${written} default file${written > 1 ? "s" : ""} in .rex/`);
  }
}
