/**
 * Regression test for aliou/pi-neuralwatt issue #53:
 * "stale `ExtensionContext` crash in the `quota-warnings` extension".
 *
 * The bug: the extension captured the `ExtensionContext` in a module-level
 * `currentContext` and dereferenced `currentContext.model` inside the
 * shared-bus `neuralwatt:quotas:updated` handler. After a session is
 * replaced (newSession/fork/switchSession/reload), pi invalidates the old
 * session-bound ctx — the `.model` getter calls
 * `ExtensionRunner.assertActive()`, which throws.
 *
 * The fix: no module-level ctx. The extension subscribes to the quota event
 * in `session_start` (capturing the fresh ctx in the closure) and
 * unsubscribes in `session_shutdown`, so the handler never runs with a stale
 * ctx and is re-armed with the replacement session's ctx on the next
 * `session_start`.
 *
 * This test loads the REAL extension factory and drives it with the REAL
 * `ExtensionRunner` (so `ctx.model` truly delegates to
 * `runner.assertActive()`) and the REAL `createEventBus()`. No ctx mocks.
 */
import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
  ExtensionRunner,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_QUOTAS_UPDATED_EVENT,
} from "../../src/events";
import factory from "./index";

/** A real ExtensionRunner, like the one pi creates per session. */
function createRunner(): ExtensionRunner {
  return new ExtensionRunner(
    [], // no extensions registered on the runner itself
    // runtime: only `invalidate` is touched (by runner.invalidate); context
    // getters we exercise (model) live on the runner itself.
    { invalidate: () => {} } as never,
    ".",
    {} as never, // sessionManager
    {} as never, // modelRegistry
  );
}

/** Minimal real shared bus, plus a `pi` stub that captures every handler the
 * extension registers (lifecycle + events) so we can drive them. The `on()`
 * stub returns an unsubscribe fn that detaches from BOTH the captured
 * handler list and the real bus, mirroring `EventBus.on()`. */
function setup() {
  const bus = createEventBus();

  const lifecycleHandlers = new Map<
    string,
    Array<(event: unknown, ctx: ExtensionContext) => unknown>
  >();
  const eventHandlers = new Map<string, Array<(data: unknown) => unknown>>();

  const pi = {
    events: {
      on(channel: string, handler: (data: unknown) => unknown) {
        let handlers = eventHandlers.get(channel);
        if (!handlers) {
          handlers = [];
          eventHandlers.set(channel, handlers);
        }
        handlers.push(handler);
        // also wire onto the real bus so the full emit path works like production
        const offBus = bus.on(channel, handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) handlers.splice(index, 1);
          offBus();
        };
      },
      emit(channel: string, data: unknown) {
        bus.emit(channel, data);
      },
    },
    on(
      type: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown,
    ) {
      let handlers = lifecycleHandlers.get(type);
      if (!handlers) {
        handlers = [];
        lifecycleHandlers.set(type, handlers);
      }
      handlers.push(handler);
    },
  } as unknown as ExtensionAPI;

  const feed = (type: string, ev: unknown, ctx: ExtensionContext) =>
    Promise.all((lifecycleHandlers.get(type) ?? []).map((h) => h(ev, ctx)));
  const dispatch = (channel: string, data: unknown) =>
    Promise.all((eventHandlers.get(channel) ?? []).map((h) => h(data)));

  return { bus, pi, feed, dispatch };
}

const CONFIG_PAYLOAD = {
  config: { quotaWarnings: { enabled: true } },
};
const QUOTA_PAYLOAD = { quotas: {}, source: "header" as const };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("issue #53 — stale ExtensionContext in quota-warnings", () => {
  it("does not throw on quota events after the session is replaced", async () => {
    // Reported stack (before the fix): index.ts:36 -> currentContext.model
    // after pi invalidated the captured ctx on session replacement.
    const { bus, pi, feed, dispatch } = setup();
    await factory(pi);
    await dispatch(NEURALWATT_CONFIG_UPDATED_EVENT, CONFIG_PAYLOAD);

    // First session: session_start arms the quota handler with its ctx.
    const ctx = createRunner().createContext(); // real ctx: .model -> assertActive()
    await feed("session_start", null, ctx);

    // Session replacement: the old runtime emits session_shutdown, then pi
    // invalidates the old session-bound ctx.
    await feed("session_shutdown", null, ctx);

    // Quota events still flow on the shared bus (e.g. the provider's async
    // fetch for the replacement session). The handler must be gone — no
    // stale ctx deref, no throw through the real bus.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bus.emit(NEURALWATT_QUOTAS_UPDATED_EVENT, QUOTA_PAYLOAD);
    await new Promise((r) => setImmediate(r)); // drain safeHandler microtask
    expect(errSpy).not.toHaveBeenCalled();
    await expect(
      dispatch(NEURALWATT_QUOTAS_UPDATED_EVENT, QUOTA_PAYLOAD),
    ).resolves.toEqual([]);
  });

  it("re-subscribes with the replacement session's fresh ctx", async () => {
    const { pi, feed, dispatch } = setup();
    await factory(pi);
    await dispatch(NEURALWATT_CONFIG_UPDATED_EVENT, CONFIG_PAYLOAD);

    const oldRunner = createRunner();
    await feed("session_start", null, oldRunner.createContext());
    await feed("session_shutdown", null, oldRunner.createContext());
    oldRunner.invalidate(); // old ctx is now stale and would throw on access

    // Replacement session: a fresh runner/ctx re-arms the handler.
    const newCtx = createRunner().createContext();
    await feed("session_start", null, newCtx);

    // Exactly one live handler, bound to the fresh ctx: no throw.
    await expect(
      dispatch(NEURALWATT_QUOTAS_UPDATED_EVENT, QUOTA_PAYLOAD),
    ).resolves.toEqual([undefined]);
  });

  it("does not accumulate duplicate handlers across sessions", async () => {
    const { pi, feed, dispatch } = setup();
    await factory(pi);
    await dispatch(NEURALWATT_CONFIG_UPDATED_EVENT, CONFIG_PAYLOAD);

    // Two session_start events without an intervening session_shutdown
    // (defensive: session_start must replace, not stack, the subscription).
    await feed("session_start", null, createRunner().createContext());
    await feed("session_start", null, createRunner().createContext());

    await expect(
      dispatch(NEURALWATT_QUOTAS_UPDATED_EVENT, QUOTA_PAYLOAD),
    ).resolves.toEqual([undefined]);
  });
});
