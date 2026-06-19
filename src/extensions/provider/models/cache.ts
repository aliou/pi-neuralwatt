import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Stale-while-revalidate disk cache for hidden Neuralwatt models.
 *
 * Hidden models are discovered by hitting the authenticated `/v1/models`
 * endpoint, which only happens inside `session_start` (Pi does not expose
 * `authStorage` to the extension factory). Because Pi validates scoped models
 * during startup — before `session_start` fires — we persist the last fetch to
 * disk so the provider can be registered with cached models instantly on the
 * next launch. The first run with no cache still warns once; subsequent runs
 * resolve cleanly.
 *
 * File shape: `{ version: 1, models: ProviderModelConfig[] }`.
 */

const CACHE_VERSION = 1;
const CACHE_FILENAME = "neuralwatt-hidden-models.json";

function cachePath(): string {
  return join(getAgentDir(), "cache", CACHE_FILENAME);
}

interface HiddenModelsCacheFile {
  version?: unknown;
  models?: unknown;
}

/**
 * Read cached hidden models synchronously.
 *
 * Designed to be called from the provider extension factory body, where Pi
 * has not entered the event loop yet. Returns an empty array if the cache is
 * missing, unreadable, or malformed.
 */
export function loadCachedHiddenModels(): ProviderModelConfig[] {
  try {
    const path = cachePath();
    if (!existsSync(path)) return [];

    const parsed: HiddenModelsCacheFile = JSON.parse(
      readFileSync(path, "utf8"),
    );
    if (!Array.isArray(parsed?.models)) return [];

    return parsed.models as ProviderModelConfig[];
  } catch {
    return [];
  }
}

/**
 * Persist hidden models to disk for the next startup.
 *
 * Called after a successful `/v1/models` fetch in `session_start`. Failures are
 * swallowed since a missing cache only degrades to first-run behavior.
 */
export async function writeHiddenModelsCache(
  models: ProviderModelConfig[],
): Promise<void> {
  try {
    const path = cachePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify({ version: CACHE_VERSION, models }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Cache writes are best-effort. A missing cache only falls back to the
    // first-run path (next session revalidates and writes again).
  }
}
