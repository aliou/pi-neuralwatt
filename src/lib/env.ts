import type { AuthStorage } from "@mariozechner/pi-coding-agent";

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
  authStorage: AuthStorage,
): Promise<string | undefined> {
  const key = await authStorage.getApiKey(PROVIDER_ID);
  return key ?? process.env.NEURALWATT_API_KEY;
}
