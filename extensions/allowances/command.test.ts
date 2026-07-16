import type {
  SettingsCommandOptions,
  SettingsSection,
} from "@aliou/pi-utils-settings";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults";
import type {
  NeuralwattConfig,
  ResolvedNeuralwattConfig,
} from "../../src/config/types";
import { NEURALWATT_CONFIG_UPDATED_EVENT } from "../../src/events";

const settingsMock = vi.hoisted(() => ({
  options: undefined as unknown,
}));

const configMock = vi.hoisted(() => ({
  global: {} as NeuralwattConfig,
  local: null as NeuralwattConfig | null,
  resolved: {} as ResolvedNeuralwattConfig,
  save: vi.fn(),
}));

vi.mock("@aliou/pi-utils-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aliou/pi-utils-settings")>()),
  registerSettingsCommand: (_pi: unknown, options: unknown) => {
    settingsMock.options = options;
  },
}));

vi.mock("../../src/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/config")>()),
  configLoader: {
    getConfig: () => configMock.resolved,
    getRawConfig: (scope: string) =>
      scope === "global" ? configMock.global : configMock.local,
    hasConfig: (scope: string) =>
      scope === "global" || configMock.local !== null,
    save: configMock.save,
  },
}));

import { registerAllowancesCommand } from "./command";

function options() {
  return settingsMock.options as SettingsCommandOptions<
    NeuralwattConfig,
    ResolvedNeuralwattConfig
  >;
}

beforeEach(() => {
  settingsMock.options = undefined;
  configMock.global = {};
  configMock.local = null;
  configMock.resolved = structuredClone(DEFAULT_CONFIG);
  configMock.save.mockReset();
});

describe("registerAllowancesCommand", () => {
  it("persists only global allowance defaults", async () => {
    registerAllowancesCommand({
      events: { emit: vi.fn() },
    } as unknown as ExtensionAPI);

    expect(options().configStore.getEnabledScopes()).toEqual(["global"]);
    await expect(options().configStore.save("local", {})).rejects.toThrow(
      "Allowances only save globally",
    );
    await options().configStore.save("global", {
      allowances: { enabled: true },
    });
    expect(configMock.save).toHaveBeenCalledWith("global", {
      allowances: { enabled: true },
    });
  });

  it("shows effective values when project allowances override defaults", () => {
    configMock.local = { allowances: { enabled: true } };
    configMock.resolved = {
      ...structuredClone(DEFAULT_CONFIG),
      allowances: {
        ...DEFAULT_CONFIG.allowances,
        enabled: true,
        session: { enabled: true, allowanceUsd: 2 },
        request: { enabled: true, allowanceUsd: 0.1 },
      },
    };
    registerAllowancesCommand({
      events: { emit: vi.fn() },
    } as unknown as ExtensionAPI);

    const sections = options().buildSections(
      {},
      configMock.resolved,
      {} as Parameters<ReturnType<typeof options>["buildSections"]>[2],
    );
    const override = sections[0] as SettingsSection;

    expect(override.label).toBe("Project override");
    expect(override.items[0]?.description).toContain("take precedence");
    expect(override.items[0]?.currentValue).toBe(
      "enabled · session enabled · cap $2.00 · request enabled · cap $0.10",
    );
  });

  it("emits the resolved config after save", async () => {
    const emit = vi.fn();
    registerAllowancesCommand({ events: { emit } } as unknown as ExtensionAPI);

    await options().onSave?.({} as ExtensionCommandContext);

    expect(emit).toHaveBeenCalledWith(NEURALWATT_CONFIG_UPDATED_EVENT, {
      config: configMock.resolved,
    });
  });
});
