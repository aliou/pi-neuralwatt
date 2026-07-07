import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Migration } from "@aliou/pi-utils-settings";
import packageJson from "../../../package.json";
import type { NeuralwattConfig, PreviousNeuralwattConfig } from "../types";

type MigrationConfig = PreviousNeuralwattConfig | NeuralwattConfig;

type FlatConfigKey = keyof Omit<PreviousNeuralwattConfig, "$schema">;
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

function isPreviousConfig(
  config: MigrationConfig,
): config is PreviousNeuralwattConfig {
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

export const flatToNestedConfigMigration: Migration<MigrationConfig> = {
  name: "flat-to-nested-config",
  shouldRun: isPreviousConfig,
  message: FLAT_CONFIG_MIGRATION_MESSAGE,
  run: async (config, filePath) => {
    await backupConfig(filePath);

    const previous = config as PreviousNeuralwattConfig;
    const nestedConfig = config as NeuralwattConfig;
    const record = previous as MutableConfigRecord;
    const nested: NeuralwattConfig = {
      provider: {
        ...(isObject(nestedConfig.provider) ? nestedConfig.provider : {}),
      },
      quotaCommand: isObject(nestedConfig.quotaCommand)
        ? { ...nestedConfig.quotaCommand }
        : {},
      quotaWarnings: isObject(nestedConfig.quotaWarnings)
        ? { ...nestedConfig.quotaWarnings }
        : {},
      subBarIntegration: isObject(nestedConfig.subBarIntegration)
        ? { ...nestedConfig.subBarIntegration }
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
