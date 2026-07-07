import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigLoader } from "@aliou/pi-utils-settings";
import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../../../package.json";
import { DEFAULT_CONFIG } from "../defaults";
import type {
  NeuralwattConfig,
  NeuralwattRawConfig,
  ResolvedNeuralwattConfig,
} from "../types";
import { backupConfig, flatToNestedConfigMigration } from "./index";

const tempDirs: string[] = [];

async function tempConfigFile(): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "neuralwatt-config-"));
  tempDirs.push(dir);
  const filePath = join(dir, "neuralwatt.json");
  await writeFile(filePath, '{"quotaCommand":false}\n', "utf-8");
  return { dir, filePath };
}

async function runFlatMigration(
  config: Record<string, unknown>,
): Promise<NeuralwattConfig> {
  const { filePath } = await tempConfigFile();
  return flatToNestedConfigMigration.run(
    config as NeuralwattRawConfig,
    filePath,
  ) as Promise<NeuralwattConfig>;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

describe("flatToNestedConfigMigration", () => {
  it("converts flat config to nested config", async () => {
    const migrated = await runFlatMigration({
      quotaCommand: false,
      quotaWarnings: true,
      subBarIntegration: false,
      includeLegacyModelIds: true,
      includeHiddenModels: true,
    });

    expect(migrated).toEqual({
      provider: {
        includeLegacyModelIds: true,
        includeHiddenModels: true,
      },
      quotaCommand: { enabled: false },
      quotaWarnings: { enabled: true },
      subBarIntegration: { enabled: false },
    });
  });

  it("preserves nested values and fills missing values from flat keys", async () => {
    const mixed = {
      quotaWarnings: false,
      includeHiddenModels: false,
      provider: { includeHiddenModels: true },
      quotaCommand: { enabled: true },
    } as Record<string, unknown>;
    const migrated = await runFlatMigration(mixed);

    expect(migrated).toEqual({
      provider: { includeHiddenModels: true },
      quotaCommand: { enabled: true },
      quotaWarnings: { enabled: false },
      subBarIntegration: {},
    });
  });

  it("creates a backup next to the migrated config", async () => {
    const { dir, filePath } = await tempConfigFile();
    await flatToNestedConfigMigration.run(
      { quotaCommand: false } as unknown as NeuralwattRawConfig,
      filePath,
    );

    const backupPath = join(
      dir,
      `neuralwatt.v${packageJson.version}-flat-config.json`,
    );
    await expect(readFile(backupPath, "utf-8")).resolves.toBe(
      '{"quotaCommand":false}\n',
    );
  });

  it("does not overwrite an existing backup", async () => {
    const { dir, filePath } = await tempConfigFile();
    const backupPath = join(
      dir,
      `neuralwatt.v${packageJson.version}-flat-config.json`,
    );
    await writeFile(backupPath, "keep me", "utf-8");

    await backupConfig(filePath);

    await expect(readFile(backupPath, "utf-8")).resolves.toBe("keep me");
  });

  it("fails the migration when the backup cannot be written", async () => {
    const dir = await mkdtemp(join(tmpdir(), "neuralwatt-config-"));
    tempDirs.push(dir);

    await expect(
      flatToNestedConfigMigration.run(
        { quotaCommand: false } as NeuralwattRawConfig,
        join(dir, "missing.json"),
      ),
    ).rejects.toThrow();
  });

  it("provides migration messages through ConfigLoader.drainMessages", async () => {
    const cwd = process.cwd();
    const dir = await mkdtemp(join(tmpdir(), "neuralwatt-loader-"));
    tempDirs.push(dir);
    const configDir = join(dir, ".pi/extensions");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "neuralwatt.json"),
      '{"quotaCommand":false}\n',
      "utf-8",
    );

    try {
      process.chdir(dir);
      const loader = new ConfigLoader<
        NeuralwattRawConfig,
        ResolvedNeuralwattConfig
      >("neuralwatt", DEFAULT_CONFIG, {
        scopes: ["local"],
        migrations: [flatToNestedConfigMigration],
      });

      await loader.load();

      expect(loader.drainMessages()).toEqual([
        "Config migrated to the nested format. A backup was written next to the original config file.",
      ]);
    } finally {
      process.chdir(cwd);
    }
  });
});
