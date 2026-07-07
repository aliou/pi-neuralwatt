import { copyFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Migration } from "@aliou/pi-utils-settings";
import packageJson from "../../../package.json";
import type { NeuralwattConfig } from "../types";

const FLAT_CONFIG_KEYS = [
  "quotaCommand",
  "quotaWarnings",
  "subBarIntegration",
  "includeLegacyModelIds",
  "includeHiddenModels",
] as const;

const FLAT_CONFIG_MIGRATION_MESSAGE =
  "Config migrated to the nested format. A backup was written next to the original config file.";

type FlatConfigKey = (typeof FLAT_CONFIG_KEYS)[number];
type MutableConfigRecord = Record<string, unknown>;

function hasOwn(record: MutableConfigRecord, key: FlatConfigKey): boolean {
  return Object.hasOwn(record, key);
}

function booleanValue(
  record: MutableConfigRecord,
  key: FlatConfigKey,
): boolean | undefined {
  return typeof record[key] === "boolean"
    ? (record[key] as boolean)
    : undefined;
}

function hasFlatConfig(config: NeuralwattConfig): boolean {
  const record = config as MutableConfigRecord;
  return FLAT_CONFIG_KEYS.some((key) => typeof record[key] === "boolean");
}

function hasNestedConfig(config: NeuralwattConfig): boolean {
  return Boolean(
    config.provider ||
      (config.quotaCommand && typeof config.quotaCommand === "object") ||
      (config.quotaWarnings && typeof config.quotaWarnings === "object") ||
      (config.subBarIntegration &&
        typeof config.subBarIntegration === "object"),
  );
}

export async function backupConfig(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  const base = basename(filePath, ".json");
  const backupPath = join(
    dir,
    `${base}.v${packageJson.version}-flat-config.json`,
  );

  try {
    await stat(backupPath);
    return;
  } catch {
    // Backup does not exist yet.
  }

  await copyFile(filePath, backupPath);
}

export const disableLegacyModelIdsByDefaultMigration: Migration<NeuralwattConfig> =
  {
    name: "disable-legacy-model-ids-by-default",
    shouldRun: (config) =>
      !hasNestedConfig(config) &&
      !hasOwn(config as MutableConfigRecord, "includeLegacyModelIds"),
    message:
      "[neuralwatt] legacy model IDs (ids including the provider and the quantization) are disabled by default. You can enable them with /neuralwatt:settings.",
    run: (config) =>
      ({
        ...(config as MutableConfigRecord),
        includeLegacyModelIds: false,
      }) as NeuralwattConfig,
  };

export const flatToNestedConfigMigration: Migration<NeuralwattConfig> = {
  name: "flat-to-nested-config",
  shouldRun: hasFlatConfig,
  message: FLAT_CONFIG_MIGRATION_MESSAGE,
  run: async (config, filePath) => {
    try {
      await backupConfig(filePath);
    } catch (error) {
      console.error(
        `[neuralwatt] Failed to back up config before flat-to-nested migration: ${error}`,
      );
    }

    const record = config as MutableConfigRecord;
    const nested: NeuralwattConfig = {
      provider: {
        ...config.provider,
      },
      quotaCommand:
        config.quotaCommand && typeof config.quotaCommand === "object"
          ? { ...config.quotaCommand }
          : {},
      quotaWarnings:
        config.quotaWarnings && typeof config.quotaWarnings === "object"
          ? { ...config.quotaWarnings }
          : {},
      subBarIntegration:
        config.subBarIntegration && typeof config.subBarIntegration === "object"
          ? { ...config.subBarIntegration }
          : {},
    };

    const includeLegacyModelIds = booleanValue(record, "includeLegacyModelIds");
    if (
      nested.provider?.includeLegacyModelIds === undefined &&
      includeLegacyModelIds !== undefined
    ) {
      nested.provider = {
        ...nested.provider,
        includeLegacyModelIds,
      };
    }

    const includeHiddenModels = booleanValue(record, "includeHiddenModels");
    if (
      nested.provider?.includeHiddenModels === undefined &&
      includeHiddenModels !== undefined
    ) {
      nested.provider = {
        ...nested.provider,
        includeHiddenModels,
      };
    }

    const quotaCommand = booleanValue(record, "quotaCommand");
    if (
      nested.quotaCommand?.enabled === undefined &&
      quotaCommand !== undefined
    ) {
      nested.quotaCommand = {
        ...nested.quotaCommand,
        enabled: quotaCommand,
      };
    }

    const quotaWarnings = booleanValue(record, "quotaWarnings");
    if (
      nested.quotaWarnings?.enabled === undefined &&
      quotaWarnings !== undefined
    ) {
      nested.quotaWarnings = {
        ...nested.quotaWarnings,
        enabled: quotaWarnings,
      };
    }

    const subBarIntegration = booleanValue(record, "subBarIntegration");
    if (
      nested.subBarIntegration?.enabled === undefined &&
      subBarIntegration !== undefined
    ) {
      nested.subBarIntegration = {
        ...nested.subBarIntegration,
        enabled: subBarIntegration,
      };
    }

    return nested;
  },
};

export const migrations: Migration<NeuralwattConfig>[] = [
  disableLegacyModelIdsByDefaultMigration,
  flatToNestedConfigMigration,
];
