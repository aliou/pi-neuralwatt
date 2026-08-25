import type {
  ModelsStoreEntry,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { NeuralwattApiModel } from "../../../src/types/models-api";
import type {
  buildNeuralwattProviderModels,
  buildNeuralwattProviderModelsFromApi,
  buildNeuralwattProviderModelsFromStore,
  NeuralwattModel,
} from "./catalog";

export const MODEL_STORE_TTL_MS = 4 * 60 * 60 * 1000;

export type FetchNeuralwattApiModels = (
  apiKey: string | undefined,
  signal?: AbortSignal,
) => Promise<readonly NeuralwattApiModel[]>;

function isFreshStoreEntry(
  entry: Readonly<ModelsStoreEntry> | undefined,
): entry is ModelsStoreEntry {
  if (!entry) return false;
  const checkedAt = entry.checkedAt ?? Date.now();
  return Date.now() - checkedAt < MODEL_STORE_TTL_MS;
}

export function createNeuralwattRefreshModels(
  staticModels: ReturnType<typeof buildNeuralwattProviderModels>,
  fetchApiModels: FetchNeuralwattApiModels,
  buildFromApi: typeof buildNeuralwattProviderModelsFromApi,
  buildFromStore: typeof buildNeuralwattProviderModelsFromStore,
) {
  return async (context: RefreshModelsContext): Promise<NeuralwattModel[]> => {
    context.signal.throwIfAborted();
    const fallback = buildFromStore(staticModels);
    try {
      if (!context.allowNetwork) {
        return context.stored
          ? buildFromStore(context.stored.models)
          : fallback;
      }
      if (!context.force && isFreshStoreEntry(context.stored)) {
        return buildFromStore(context.stored.models);
      }
      const apiKey =
        context.credential?.type === "api_key"
          ? context.credential.key
          : undefined;
      const apiModels = await fetchApiModels(apiKey, context.signal);
      context.signal.throwIfAborted();
      const models = buildFromApi(apiModels);
      await context
        .publish({
          persist: {
            models: models as unknown as ModelsStoreEntry["models"],
            checkedAt: Date.now(),
          },
        })
        .catch(() => undefined);
      context.signal.throwIfAborted();
      return models;
    } catch (error) {
      if (
        context.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      return fallback;
    }
  };
}
