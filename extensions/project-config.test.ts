import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SettingsCommandOptions } from "@aliou/pi-utils-settings";
import type { Provider } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import {
  createEventBus,
  type ExtensionCommandContext,
  type ExtensionContext,
  type RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { loadExtensions } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader";
import {
  initTheme,
  theme,
} from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme";
import { DEFAULT_CONFIG } from "../src/config/defaults";
import type {
  NeuralwattConfig,
  ResolvedNeuralwattConfig,
} from "../src/config/types";
import { NEURALWATT_QUOTAS_UPDATED_EVENT } from "../src/events";

const root = await mkdtemp(join(tmpdir(), "neuralwatt-trust-"));
const agentDir = join(root, "agent");
const cwd = join(root, "project");
await mkdir(join(cwd, ".pi", "extensions"), { recursive: true });
vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
vi.spyOn(process, "cwd").mockReturnValue(cwd);
const { buildQuotasFromHeaders } = await import("./provider/quota-store");
const { default: factory } = await import("./provider/index");
const { default: quotaFactory } = await import("./command-quotas/index");
const { default: warningsFactory } = await import("./quota-warnings/index");
const { configLoader } = await import("../src/config");

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function setup(
  trusted: boolean,
  globalApi = "openai-completions",
  activate = factory,
  enabled = true,
) {
  const localDir = join(cwd, ".pi", "extensions");
  await mkdir(join(agentDir, "extensions"), { recursive: true });
  await mkdir(localDir, { recursive: true });
  await writeFile(
    join(agentDir, "extensions", "neuralwatt.json"),
    JSON.stringify({
      provider: { api: globalApi, apiBaseUrl: "https://global.example/v1" },
      quotaCommand: { enabled },
      quotaWarnings: { enabled },
    }),
  );
  const localPath = join(localDir, "neuralwatt.json");
  const local = JSON.stringify({
    provider: {
      api: "anthropic-messages",
      apiBaseUrl: "https://project.example/v1",
    },
    quotaCommand: { enabled: !enabled },
    quotaWarnings: { enabled: !enabled },
    subBarIntegration: { enabled: true },
  });
  await writeFile(localPath, local);
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("unavailable", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetch);
  const handlers: Array<(event: unknown, ctx: ExtensionContext) => unknown> =
    [];
  const providers: Provider[] = [];
  const notify = vi.fn();
  const bus = createEventBus();
  const commands = new Map<string, RegisteredCommand>();
  await activate({
    events: bus,
    registerProvider: (provider: Provider) => providers.push(provider),
    registerCommand: (name: string, command: RegisteredCommand) =>
      commands.set(name, command),
    on: (
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown,
    ) => {
      if (event === "session_start") handlers.push(handler);
    },
  } as never);
  const ctx = {
    cwd,
    isProjectTrusted: () => trusted,
    model: { provider: "neuralwatt" },
    modelRegistry: { getApiKeyForProvider: async () => "test-key" },
    hasUI: true,
    ui: { notify, custom: async () => undefined },
  } as unknown as ExtensionContext;
  return {
    fetch,
    bus,
    ctx,
    commands,
    providers,
    notify,
    localPath,
    local,
    localDir,
    start: async () => {
      for (const handler of handlers)
        await handler({ type: "session_start" }, ctx);
    },
  };
}

async function refresh(provider: Provider) {
  await provider.refreshModels?.({
    allowNetwork: true,
    force: true,
    credential: { type: "api_key", key: "test-key" },
    signal: new AbortController().signal,
    publish: async (publication) => {
      publication.update?.();
      return true;
    },
  });
}

describe("project configuration", () => {
  it("uses the global URL before session startup", async () => {
    const { fetch, providers, localPath, local } = await setup(false);
    await refresh(providers[0]);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://global.example/v1/models");
    expect(providers[0].getModels()[0].baseUrl).toBe(
      "https://global.example/v1",
    );
    expect(await readFile(localPath, "utf8")).toBe(local);
  });

  it("keeps untrusted project settings out of quota, catalog and prompt requests", async () => {
    const { fetch, providers, start, notify, localPath, local, localDir } =
      await setup(false);
    await start();
    const provider = providers[providers.length - 1];
    await refresh(provider);
    const model = provider.getModels()[0];
    await provider
      .streamSimple(model, normalizeContext({ messages: [] }), {
        apiKey: "test-key",
      })
      .result();
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://global.example/v1/quota",
      "https://global.example/v1/models",
      "https://global.example/v1/chat/completions",
    ]);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer test-key",
      );
    }
    expect(model.api).toBe("openai-completions");
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("project not trusted"),
      "info",
    );
    await expect(configLoader.save("local", {})).rejects.toThrow();
    expect(await readFile(localPath, "utf8")).toBe(local);
    expect(await readdir(localDir)).toEqual(["neuralwatt.json"]);
  });

  it("applies trusted project settings before quota requests and replaces the API", async () => {
    const { fetch, providers, start } = await setup(true);
    expect(providers[0].getModels()[0].api).toBe("openai-completions");
    await start();
    expect(providers).toHaveLength(2);
    const provider = providers[1];
    expect(provider.getModels()[0].api).toBe("anthropic-messages");
    expect(provider.getModels()[0].baseUrl).toBe("https://project.example");
    await refresh(provider);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://project.example/v1/quota",
      "https://project.example/v1/models",
    ]);
  });

  it("uses the default URL when global settings are absent", async () => {
    const { fetch, providers, start } = await setup(false);
    await rm(join(agentDir, "extensions", "neuralwatt.json"));
    await configLoader.load();
    await start();
    await refresh(providers[0]);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${DEFAULT_CONFIG.provider.apiBaseUrl}/quota`,
      `${DEFAULT_CONFIG.provider.apiBaseUrl}/models`,
    ]);
    expect(providers[0].getModels()[0].baseUrl).toBe(
      DEFAULT_CONFIG.provider.apiBaseUrl,
    );
  });

  it("keeps the provider when the trusted API matches the registered API", async () => {
    const { providers, start } = await setup(true, "anthropic-messages");
    await start();
    expect(providers).toHaveLength(1);
    expect(providers[0].getModels()[0].baseUrl).toBe("https://project.example");
  });
});

describe("feature configuration", () => {
  it.each([
    false,
    true,
  ])("checks quota command settings at invocation with trusted=%s", async (trusted) => {
    const { commands, start, ctx, fetch } = await setup(
      trusted,
      "openai-completions",
      quotaFactory,
      false,
    );
    const command = commands.get("neuralwatt:quota");
    expect(command).toBeDefined();
    await start();
    await command?.handler("", ctx as ExtensionCommandContext);
    expect(fetch).toHaveBeenCalledTimes(trusted ? 1 : 0);
  });

  it.each([
    false,
    true,
  ])("applies provider settings saves across independent entry points starting enabled=%s", async (enabled) => {
    const { ctx, fetch } = await setup(
      false,
      "openai-completions",
      factory,
      enabled,
    );
    const loaded = await loadExtensions(
      [
        new URL("./provider/index.ts", import.meta.url).pathname,
        new URL("./command-quotas/index.ts", import.meta.url).pathname,
      ],
      cwd,
      createEventBus(),
    );
    expect(loaded.errors).toEqual([]);
    for (const extension of loaded.extensions) {
      for (const handler of extension.handlers.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    }
    const settings = loaded.extensions[0].commands.get("neuralwatt:settings");
    const quota = loaded.extensions[1].commands.get("neuralwatt:quota");
    expect(settings).toBeDefined();
    expect(quota).toBeDefined();
    initTheme("dark", false);
    for (const next of [!enabled, enabled]) {
      const custom = vi.fn(
        async (
          create: Parameters<ExtensionCommandContext["ui"]["custom"]>[0],
        ) => {
          const panel = create(
            { requestRender: vi.fn() } as never,
            theme,
            {} as never,
            vi.fn(),
          ) as unknown as Pick<
            SettingsCommandOptions<NeuralwattConfig, ResolvedNeuralwattConfig>,
            "configStore" | "onSave"
          >;
          await panel.configStore.save("global", {
            quotaCommand: { enabled: next },
          });
          expect(panel.configStore.getConfig().quotaCommand.enabled).toBe(next);
          await panel.onSave?.(ctx as ExtensionCommandContext);
        },
      );
      await settings?.handler("", {
        ...ctx,
        ui: { ...ctx.ui, custom },
      } as unknown as ExtensionCommandContext);
      await new Promise((resolve) => setImmediate(resolve));
      fetch.mockClear();
      await quota?.handler("", ctx as ExtensionCommandContext);
      expect(fetch).toHaveBeenCalledTimes(next ? 1 : 0);
    }
  });

  it.each([
    false,
    true,
  ])("loads quota warning settings before subscribing with trusted=%s", async (trusted) => {
    const { bus, start, notify } = await setup(
      trusted,
      "openai-completions",
      warningsFactory,
    );
    await start();
    const quotas = buildQuotasFromHeaders({
      "x-allowance-remaining-usd": "1",
      "x-subscription-plan": "standard",
      "x-energy-included": "10",
      "x-energy-remaining": "1",
    });
    expect(quotas).toBeDefined();
    bus.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, { quotas, source: "header" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(notify).toHaveBeenCalledTimes(trusted ? 0 : 1);
    if (!trusted)
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining("Neuralwatt quota warning"),
        "error",
      );
  });
});
