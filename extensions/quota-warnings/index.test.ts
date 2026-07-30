import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEURALWATT_QUOTAS_UPDATED_EVENT } from "../../src/events";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import factory from "./index";
import { clearAlertState } from "./notifier";

/**
 * The config module is stubbed so the factory never touches disk. The loader
 * is a singleton (same reference on every call) so runtime config-toggle
 * listeners behave as in production.
 */
vi.mock("../../src/config", () => {
  const configLoader = {
    load: vi.fn(async () => {}),
    getConfig: () => ({ quotaWarnings: { enabled: true } }),
  };
  return { configLoader };
});

/**
 * Fake ExtensionContext. `.model` is a getter that mirrors real Pi: it throws
 * once the ctx is deactivated (`__deactivate()`), simulating "ctx is stale
 * after session replacement". `ui.notify` records calls for assertion.
 */
interface FakeCtx {
  calls: { level: string; msg: string }[];
  __deactivate(): void;
}

function fakeCtx(provider = "neuralwatt"): ExtensionContext & FakeCtx {
  const state = { provider, active: true };
  const calls: { level: string; msg: string }[] = [];
  const ctx = {
    calls,
    hasUI: true,
    get model() {
      if (!state.active) {
        throw new Error(
          "This extension ctx is stale after session replacement or reload.",
        );
      }
      return { provider: state.provider };
    },
    ui: {
      notify: (msg: string, level: "info" | "warning" | "error") => {
        calls.push({ level, msg });
      },
    },
    __deactivate() {
      state.active = false;
    },
  };
  return ctx as unknown as ExtensionContext & FakeCtx;
}

/** A NeuralwattQuotas payload whose balance credits trigger a low-quota notify. */
function lowQuotas(): NeuralwattQuotas {
  return {
    snapshot_at: "2026-07-22T14:25:43Z",
    balance: {
      // 4 / 20 = 20% remaining — above critical (10%) but at/below low (25%),
      // so checkQuotas emits a `warning`-level notify.
      credits_remaining_usd: 4,
      total_credits_usd: 20,
      credits_used_usd: 16,
      accounting_method: "token",
    },
    usage: {
      lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
      current_month: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
    },
    limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    subscription: null,
    key: { name: "test", allowance: null },
  };
}

/** Minimal fake ExtensionAPI recording every `pi.on` registration. */
interface FakePi {
  pi: ExtensionAPI;
  /** lifecycle handlers captured by `pi.on(event, handler)` */
  handlers: Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>;
  /** every `pi.on` event name, in registration order */
  onCalls: string[];
  /** generic event bus: channel -> handlers, with real unsubscribe semantics */
  emit(channel: string, data: unknown): void;
}

function fakePi(): FakePi {
  const handlers = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  const onCalls: string[] = [];
  const channels = new Map<string, Set<(data: unknown) => void>>();
  // reset stale ctx via no-op session flags before re-firing.
  const pi = {
    on(
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown,
    ) {
      onCalls.push(event);
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    events: {
      on(channel: string, handler: (data: unknown) => void) {
        let set = channels.get(channel);
        if (!set) {
          set = new Set();
          channels.set(channel, set);
        }
        set.add(handler);
        return () => {
          set?.delete(handler);
        };
      },
      emit(channel: string, data: unknown) {
        const set = channels.get(channel);
        if (!set) return;
        for (const h of set) h(data);
      },
    },
  } as unknown as ExtensionAPI;

  const emit = (channel: string, data: unknown) =>
    pi.events.emit(channel, data);

  const fake: FakePi = { pi, handlers, onCalls, emit };
  return fake;
}

async function loadFactory(pi: ExtensionAPI): Promise<void> {
  await factory(pi);
}

function emitQuotas(pi: FakePi, quotas: NeuralwattQuotas): void {
  pi.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, { quotas, source: "header" });
}

function startSession(pi: FakePi, ctx: ExtensionContext): void {
  for (const h of pi.handlers.get("session_start") ?? [])
    h({ type: "session_start", reason: "new" }, ctx);
}

function shutdownSession(pi: FakePi): void {
  for (const h of pi.handlers.get("session_shutdown") ?? [])
    h({ type: "session_shutdown", reason: "quit" }, {} as ExtensionContext);
}

function selectModel(pi: FakePi, ctx: ExtensionContext): void {
  for (const h of pi.handlers.get("model_select") ?? [])
    h(
      {
        type: "model_select",
        model: {},
        previousModel: undefined,
        source: "set",
      },
      ctx,
    );
}

describe("quota-warnings extension (stale-ctx guard)", () => {
  beforeEach(() => {
    clearAlertState();
  });

  it("delivers quota updates to the active session's ctx", async () => {
    const pi = fakePi();
    await loadFactory(pi.pi);
    const ctx = fakeCtx("neuralwatt");

    startSession(pi, ctx);
    emitQuotas(pi, lowQuotas());

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0].level).toBe("warning");
    expect(ctx.calls[0].msg).toContain("Credits:");
    expect(ctx.calls[0].msg).toContain("20%");
  });

  it("does not dereference a stale ctx after session replacement", async () => {
    const pi = fakePi();
    await loadFactory(pi.pi);
    const ctx1 = fakeCtx("neuralwatt");
    const ctx2 = fakeCtx("neuralwatt");

    startSession(pi, ctx1);
    // Real Pi ordering: session replacement supersedes ctx1, then the new
    // session's `session_start` fires — the fix unsubscribes ctx1's listener
    // before any quota event can deliver to it.
    startSession(pi, ctx2);
    ctx1.__deactivate();
    emitQuotas(pi, lowQuotas());

    expect(ctx1.calls).toHaveLength(0);
    // The active session's listener still delivers the warning.
    expect(ctx2.calls).toHaveLength(1);
  });

  it("unsubscribes the quota listener on session_shutdown", async () => {
    const pi = fakePi();
    await loadFactory(pi.pi);
    const ctx = fakeCtx("neuralwatt");

    startSession(pi, ctx);
    shutdownSession(pi);
    ctx.__deactivate();
    emitQuotas(pi, lowQuotas());

    expect(ctx.calls).toHaveLength(0);
  });

  it("skips quota events when the active provider is not neuralwatt", async () => {
    const pi = fakePi();
    await loadFactory(pi.pi);
    const ctx = fakeCtx("openai");

    startSession(pi, ctx);
    emitQuotas(pi, lowQuotas());

    expect(ctx.calls).toHaveLength(0);
  });

  it("model_select does not redirect the quota listener to a new ctx", async () => {
    const pi = fakePi();
    await loadFactory(pi.pi);
    const ctx1 = fakeCtx("neuralwatt");
    const ctx2 = fakeCtx("neuralwatt");

    startSession(pi, ctx1);
    selectModel(pi, ctx2);
    emitQuotas(pi, lowQuotas());

    // The quota listener is bound to the session that started it; model_select
    // no longer reassigns it. Exactly one notify, on ctx1.
    expect(ctx1.calls).toHaveLength(1);
    expect(ctx2.calls).toHaveLength(0);
    // The fixed factory registers no model_select handler at all.
    expect(pi.onCalls).not.toContain("model_select");
  });
});
