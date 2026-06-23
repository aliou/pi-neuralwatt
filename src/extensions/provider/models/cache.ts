import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Stale-while-revalidate disk cache for Neuralwatt models.
 *
 * The provider ships no hardcoded model list. The only thing that populates
 * it is `/neuralwatt:fetch`, which hits the authenticated `/v1/models`
 * endpoint. Because Pi filters providers whose models have auth configured
 * (see `ModelRegistry.getAvailable`), registering with an empty list makes
 * the provider disappear from the picker entirely — so the last fetched list
 * is persisted to disk and restored synchronously at startup.
 *
 * This is **not** session-start discovery: no API call is made on startup, the
 * cache is only ever written by `/neuralwatt:fetch`. The first run with no
 * cache still starts empty (run `/neuralwatt:fetch` once); every subsequent
 * launch resolves instantly from disk.
 *
 * File shape: `{ version: 1, models: ProviderModelConfig[] }`.
 */

const CACHE_VERSION = 1;
const CACHE_FILENAME = "neuralwatt-models.json";

function cachePath(): string {
  return join(getAgentDir(), "cache", CACHE_FILENAME);
}

interface ModelsCacheFile {
  version?: unknown;
  models?: unknown;
}

/**
 * Read cached models synchronously.
 *
 * Designed to be called from the provider extension factory body, where Pi
 * has not entered the event loop yet. Returns an empty array if the cache is
 * missing, unreadable, or malformed.
 */
export function loadCachedModels(): ProviderModelConfig[] {
  try {
    const path = cachePath();
    if (!existsSync(path)) return [];
    const parsed: ModelsCacheFile = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed?.models)) return [];
    return parsed.models as ProviderModelConfig[];
  } catch {
    return [];
  }
}

/**
 * Persist the fetched model list to disk for the next startup.
 *
 * Called after a successful `/neuralwatt:fetch`. Failures are swallowed since
 * a missing cache only degrades to first-run behavior on the next launch.
 */
export async function writeModelsCache(
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
    // first-run path (the next /neuralwatt:fetch rewrites it).
  }
}
