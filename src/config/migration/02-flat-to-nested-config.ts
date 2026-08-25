import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Migration } from "@aliou/pi-utils-settings";
import packageJson from "../../../package.json";

/** The original flat config, replaced by per-feature sections. */
interface FlatNeuralwattConfig {
  $schema?: string;
  quotaCommand?: boolean;
  quotaWarnings?: boolean;
  subBarIntegration?: boolean;
  includeLegacyModelIds?: boolean;
  /** Renamed to `provider.includeEarlyAccessModels` by migration 03. */
  includeHiddenModels?: boolean;
}

type FlatConfigKey = keyof FlatNeuralwattConfig;
type MutableConfigRecord = Record<string, unknown>;

const FLAT_CONFIG_KEYS = [
  "quotaCommand",
  "quotaWarnings",
  "subBarIntegration",
  "includeLegacyModelIds",
  "includeHiddenModels",
] as const satisfies readonly FlatConfigKey[];

const FLAT_CONFIG_MIGRATION_MESSAGE =
  "Config migrated to the nested format. A backup was written next to the original config file.";

function booleanValue(
  record: MutableConfigRecord,
  key: FlatConfigKey,
): boolean | undefined {
  return typeof record[key] === "boolean"
    ? (record[key] as boolean)
    : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPreviousConfig(config: FlatNeuralwattConfig): boolean {
  const record = config as MutableConfigRecord;
  return FLAT_CONFIG_KEYS.some((key) => typeof record[key] === "boolean");
}

export async function backupConfig(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  const base = basename(filePath, ".json");
  const backupPath = join(
    dir,
    `${base}.v${packageJson.version}-flat-config.json`,
  );

  try {
    await copyFile(filePath, backupPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return;
    }
    throw error;
  }
}

export const flatToNestedConfigMigration: Migration<FlatNeuralwattConfig> = {
  name: "flat-to-nested-config",
  version: "0.8.1",
  shouldRun: isPreviousConfig,
  message: FLAT_CONFIG_MIGRATION_MESSAGE,
  run: async (config, filePath) => {
    await backupConfig(filePath);

    const record = config as unknown as MutableConfigRecord;

    // Preserve existing nested values from a partially-migrated config.
    const existingProvider = isObject(record.provider)
      ? { ...record.provider }
      : {};
    const existingQuotaCommand = isObject(record.quotaCommand)
      ? { ...record.quotaCommand }
      : {};
    const existingQuotaWarnings = isObject(record.quotaWarnings)
      ? { ...record.quotaWarnings }
      : {};
    const existingSubBarIntegration = isObject(record.subBarIntegration)
      ? { ...record.subBarIntegration }
      : {};

    const nested = {
      provider: existingProvider as Record<string, unknown>,
      quotaCommand: existingQuotaCommand as Record<string, unknown>,
      quotaWarnings: existingQuotaWarnings as Record<string, unknown>,
      subBarIntegration: existingSubBarIntegration as Record<string, unknown>,
    };

    const includeLegacyModelIds = booleanValue(record, "includeLegacyModelIds");
    if (includeLegacyModelIds !== undefined) {
      nested.provider = { ...nested.provider, includeLegacyModelIds };
    }

    const includeHiddenModels = booleanValue(record, "includeHiddenModels");
    if (includeHiddenModels !== undefined) {
      nested.provider = { ...nested.provider, includeHiddenModels };
    }

    const quotaCommand = booleanValue(record, "quotaCommand");
    if (quotaCommand !== undefined) {
      nested.quotaCommand = { enabled: quotaCommand };
    }

    const quotaWarnings = booleanValue(record, "quotaWarnings");
    if (quotaWarnings !== undefined) {
      nested.quotaWarnings = { enabled: quotaWarnings };
    }

    const subBarIntegration = booleanValue(record, "subBarIntegration");
    if (subBarIntegration !== undefined) {
      nested.subBarIntegration = { enabled: subBarIntegration };
    }

    return nested as unknown as FlatNeuralwattConfig;
  },
};
