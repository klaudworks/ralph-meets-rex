import { getVersion } from "./version";
import { ui } from "./ui";

const PACKAGE_NAME = "@klaudworks/rmr";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const FETCH_TIMEOUT_MS = 3000;

function isNewer(latest: string, current: string): boolean {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }

  return false;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Start a non-blocking update check. Returns a function that, when called,
 * prints the update notice if a newer version is available.
 * Call `start` early, call the returned function after the command finishes.
 */
export function startUpdateCheck(): () => void {
  const currentVersion = getVersion();
  let result: { latestVersion: string } | null = null;

  const check = fetchLatestVersion().then((latestVersion) => {
    if (latestVersion && isNewer(latestVersion, currentVersion)) {
      result = { latestVersion };
    }
  }).catch(() => {
    // Never fail the main command
  });

  return () => {
    check.then(() => {
      if (result) {
        process.stderr.write("\n");
        ui.dim(`Update available: ${currentVersion} → ${result.latestVersion}\n`);
        ui.dim(`Run: npm install -g ${PACKAGE_NAME}@${result.latestVersion}\n`);
      }
    }).catch(() => {});
  };
}
