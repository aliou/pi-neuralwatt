import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults";
import type { ResolvedNeuralwattConfig } from "../../src/config/types";
import {
  NEURALWATT_ALLOWANCES_UPDATED_EVENT,
  NEURALWATT_CONFIG_UPDATED_EVENT,
  type NeuralwattAllowancesUpdatedPayload,
} from "../../src/events";

const mocks = vi.hoisted(() => ({
  config: {} as ResolvedNeuralwattConfig,
  load: vi.fn(),
  registerCommand: vi.fn(),
  checkWarnings: vi.fn(),
  clearWarnings: vi.fn(),
}));

vi.mock("../../src/config", () => ({
  configLoader: {
    load: mocks.load,
    getConfig: () => mocks.config,
  },
}));

vi.mock("./command", () => ({
  registerAllowancesCommand: mocks.registerCommand,
}));

vi.mock("./warnings", () => ({
  checkAllowanceWarnings: mocks.checkWarnings,
  clearAllowanceWarningState: mocks.clearWarnings,
}));

import initializeAllowances from "./index";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function createPi() {
  const handlers = new Map<string, Handler>();
  const eventHandlers = new Map<string, (data: unknown) => unknown>();
  const pi = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    events: {
      on: vi.fn((event: string, handler: (data: unknown) => unknown) => {
        eventHandlers.set(event, handler);
      }),
    },
  } as unknown as ExtensionAPI;
  return { pi, handlers, eventHandlers };
}

function context(provider = "neuralwatt") {
  const setWidget = vi.fn();
  const ctx = {
    hasUI: true,
    model: { provider },
    sessionManager: { getSessionId: () => "session-1" },
    ui: { setWidget },
  } as unknown as ExtensionContext;
  return { ctx, setWidget };
}

const snapshot: NeuralwattAllowancesUpdatedPayload = {
  sessionId: "session-1",
  sessionAllowanceUsd: 1,
  requestAllowanceUsd: 0.05,
  sessionSpentUsd: 0.5,
  sessionAllowanceRemainingUsd: 0.5,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  mocks.config = structuredClone(DEFAULT_CONFIG);
  mocks.load.mockReset();
  mocks.registerCommand.mockReset();
  mocks.checkWarnings.mockReset();
  mocks.clearWarnings.mockReset();
});

describe("allowances extension", () => {
  it("injects headers only for Neuralwatt requests", async () => {
    mocks.config.allowances = {
      ...DEFAULT_CONFIG.allowances,
      enabled: true,
      session: { enabled: true, allowanceUsd: 1 },
      request: { enabled: true, allowanceUsd: 0.05 },
    };
    const { pi, handlers } = createPi();
    await initializeAllowances(pi);
    const handler = handlers.get("before_provider_headers");
    const headers: Record<string, string | null | undefined> = {};

    handler?.({ headers }, context("openai").ctx);
    expect(headers).toEqual({});

    handler?.({ headers }, context().ctx);
    expect(headers).toEqual({
      "X-Session-ID": "session-1",
      "X-Session-Allowance-USD": "1",
      "X-Request-Allowance-USD": "0.05",
    });
  });

  it("updates and clears the widget across allowance and model events", async () => {
    mocks.config.allowances = {
      ...DEFAULT_CONFIG.allowances,
      enabled: true,
      widget: { enabled: true, placement: "belowEditor" },
      warnings: { enabled: true, remainingThresholds: [50, 20, 10] },
    };
    const { pi, handlers, eventHandlers } = createPi();
    const { ctx, setWidget } = context();
    await initializeAllowances(pi);

    await handlers.get("session_start")?.({}, ctx);
    eventHandlers.get(NEURALWATT_ALLOWANCES_UPDATED_EVENT)?.(snapshot);

    expect(setWidget).toHaveBeenLastCalledWith(
      "neuralwatt-allowances",
      [
        "Neuralwatt allowance",
        "Session: $0.50 remaining (50% remaining)",
        "Spent: $0.50",
      ],
      { placement: "belowEditor" },
    );
    expect(mocks.checkWarnings).toHaveBeenCalledWith(
      ctx,
      snapshot,
      mocks.config.allowances.warnings,
    );

    const next = context("openai");
    handlers.get("model_select")?.({}, next.ctx);
    expect(next.setWidget).toHaveBeenLastCalledWith(
      "neuralwatt-allowances",
      undefined,
    );
    expect(mocks.clearWarnings).toHaveBeenCalled();
  });

  it("applies config updates to active widget state", async () => {
    mocks.config.allowances = {
      ...DEFAULT_CONFIG.allowances,
      enabled: true,
      widget: { enabled: true, placement: "aboveEditor" },
    };
    const { pi, handlers, eventHandlers } = createPi();
    const { ctx, setWidget } = context();
    await initializeAllowances(pi);
    await handlers.get("session_start")?.({}, ctx);
    eventHandlers.get(NEURALWATT_ALLOWANCES_UPDATED_EVENT)?.(snapshot);

    const disabled = structuredClone(mocks.config);
    disabled.allowances.enabled = false;
    eventHandlers.get(NEURALWATT_CONFIG_UPDATED_EVENT)?.({ config: disabled });

    expect(setWidget).toHaveBeenLastCalledWith(
      "neuralwatt-allowances",
      undefined,
    );
    expect(mocks.clearWarnings).toHaveBeenCalled();
  });
});
