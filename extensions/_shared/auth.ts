import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "neuralwatt";

/**
 * Get the Neuralwatt API key through Pi's auth handling.
 *
 * Resolution order:
 * 1. Runtime override (CLI --api-key)
 * 2. auth.json entry for "neuralwatt"
 * 3. Environment variable NEURALWATT_API_KEY
 */
export async function getNeuralwattApiKey(
  modelRegistry: ModelRegistry,
): Promise<string | undefined> {
  return modelRegistry.getApiKeyForProvider(PROVIDER_ID);
}
