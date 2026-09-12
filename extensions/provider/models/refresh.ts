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

/**
 * Scope a store entry applies to. The public catalog is a subset of any
 * key-scoped catalog (preview, grant-gated, private models), so an entry
 * stamped "public" must not shadow a keyed refresh — and a key-scoped entry
 * must not be replayed for an anonymous user. Matches the anonymous-key
 * convention in src/lib/neuralwatt-api.ts (authHeaders).
 */
const CATALOG_SCOPE_VERSION = "v1";
type CatalogScope = "public" | "key";

type ScopedModelsStoreEntry = ModelsStoreEntry & { catalogKey?: string };

function catalogScope(apiKey: string | undefined): CatalogScope {
  return apiKey !== undefined && apiKey !== "" && apiKey !== "-"
    ? "key"
    : "public";
}

function storedCatalogKey(entry: ScopedModelsStoreEntry): string | undefined {
  return entry.catalogKey;
}

function catalogKeyMatches(
  entry: ScopedModelsStoreEntry | undefined,
  scope: CatalogScope,
): boolean {
  return (
    entry !== undefined &&
    storedCatalogKey(entry) === `${scope} ${CATALOG_SCOPE_VERSION}`
  );
}

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

function isUsableStoreEntry(
  entry: Readonly<ModelsStoreEntry> | undefined,
  scope: CatalogScope,
): entry is ModelsStoreEntry {
  return isFreshStoreEntry(entry) && catalogKeyMatches(entry, scope);
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
      const apiKey =
        context.credential?.type === "api_key"
          ? context.credential.key
          : undefined;
      const scope = catalogScope(apiKey);
      const stored = context.stored as ScopedModelsStoreEntry | undefined;
      if (!context.allowNetwork) {
        return stored !== undefined && catalogKeyMatches(stored, scope)
          ? buildFromStore(stored.models)
          : fallback;
      }
      if (!context.force && isUsableStoreEntry(stored, scope)) {
        return buildFromStore(stored.models);
      }
      const apiModels = await fetchApiModels(apiKey, context.signal);
      context.signal.throwIfAborted();
      const models = buildFromApi(apiModels);
      const entry: ScopedModelsStoreEntry = {
        models: models as unknown as ModelsStoreEntry["models"],
        checkedAt: Date.now(),
        catalogKey: `${scope} ${CATALOG_SCOPE_VERSION}`,
      };
      await context.publish({ persist: entry }).catch(() => undefined);
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
